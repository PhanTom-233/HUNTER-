/**
 * JSON 文件存储层。
 *
 * 设计要点：
 * 1. **读入内存 → 修改 → 防抖 300ms 落盘 → 原子写入**（先写同目录 `.tmp`，再 `rename` 覆盖）。
 *    不跨盘 rename，避免 Windows 上 EXDEV。
 * 2. 每个文件（index + 每个项目）有独立的防抖计时器与写入队列，同一文件的写串行化，杜绝 rename 竞争。
 * 3. 每次覆盖项目文件前，先把旧文件复制到 `data/backup/<projectId>-<yyyymmdd-HHmm>.json`，
 *    每个项目最多保留 50 份，超出按文件名（时间戳）排序删最旧。
 * 4. 进程退出时 flush 所有待写：SIGINT/SIGTERM/beforeExit 走异步 flush，
 *    `process.on('exit')` 还有一层同步兜底，保证最后一次修改不丢。
 * 5. 首次启动自动建目录；index.json 不存在就初始化为空索引，**不自动创建 demo 项目**。
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import type {
  Activity,
  Asset,
  BreakLog,
  CreateProjectInput,
  Endpoint,
  Feature,
  GraphPosition,
  ManualEdge,
  Project,
  ProjectData,
  ProjectIndex,
  ProjectMode,
  ProjectStatus,
  ProjectSummary,
  Report,
  ReportFile,
  Seed,
  TestRecord,
  UpdateProjectInput,
} from '../shared/types';
import { ApiError, NotFoundError } from './http';

/* ------------------------------------------------------------------ */
/* 路径常量                                                            */
/* ------------------------------------------------------------------ */

/** 数据目录可用环境变量覆盖，便于测试；默认是进程工作目录下的 `data/` */
const DATA_DIR = process.env.HUNTER_DATA_DIR
  ? path.resolve(process.env.HUNTER_DATA_DIR)
  : path.join(process.cwd(), 'data');

const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

/** 索引文件在写入队列里的 key（项目用 projectId 作 key） */
const INDEX_KEY = '__index__';

const DEBOUNCE_MS = 300;
const MAX_BACKUPS_PER_PROJECT = 50;

/* ------------------------------------------------------------------ */
/* 内存状态                                                            */
/* ------------------------------------------------------------------ */

let initialized = false;

let index: ProjectIndex = { version: 1, activeProjectId: null, projects: [] };

const projectCache = new Map<string, ProjectData>();
const dirtyKeys = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const writeChains = new Map<string, Promise<void>>();

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function ensureInit(): void {
  if (!initialized) {
    throw new ApiError('STORE_NOT_READY', '存储层尚未初始化', 500);
  }
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function isNotFound(err: unknown): boolean {
  return isNodeErrnoException(err) && err.code === 'ENOENT';
}

function projectFile(projectId: string): string {
  return path.join(DATA_DIR, `${projectId}.json`);
}

/** yyyymmdd-HHmm（本地时间，文件名可直接按字典序排时间） */
function formatStamp(date: Date): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const hm = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${ymd}-${hm}`;
}

function toSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    targetName: project.targetName,
    mode: project.mode,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* 规范化（旧 JSON 也能读，缺字段补默认值）                            */
/* ------------------------------------------------------------------ */

function normalizeProject(projectId: string, raw: Partial<Project> | undefined): Project {
  const now = new Date().toISOString();
  const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name : projectId;
  const mode: ProjectMode = raw?.mode === 'free' ? 'free' : 'lock';
  const status: ProjectStatus =
    raw?.status === 'paused' || raw?.status === 'archived' ? raw.status : 'active';
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : projectId,
    name,
    targetName: typeof raw?.targetName === 'string' ? raw.targetName : name,
    mode,
    scopeNote: typeof raw?.scopeNote === 'string' ? raw.scopeNote : '',
    srcUrl: typeof raw?.srcUrl === 'string' ? raw.srcUrl : '',
    status,
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeProjectData(projectId: string, raw: Partial<ProjectData> | null): ProjectData {
  const source: Partial<ProjectData> = raw && typeof raw === 'object' ? raw : {};
  return {
    project: normalizeProject(projectId, source.project),
    seeds: asArray<Seed>(source.seeds),
    assets: asArray<Asset>(source.assets),
    endpoints: asArray<Endpoint>(source.endpoints),
    tests: asArray<TestRecord>(source.tests),
    reports: asArray<Report>(source.reports),
    reportFiles: asArray<ReportFile>(source.reportFiles),
    manualEdges: asArray<ManualEdge>(source.manualEdges),
    graphPositions: asArray<GraphPosition>(source.graphPositions),
    features: asArray<Feature>(source.features),
    activity: asArray<Activity>(source.activity),
    breakLogs: asArray<BreakLog>(source.breakLogs),
  };
}

function normalizeIndex(raw: unknown): ProjectIndex {
  const source = (raw ?? {}) as Partial<ProjectIndex>;
  const projects = asArray<ProjectSummary>(source.projects).filter(
    (item): item is ProjectSummary => typeof item?.id === 'string' && item.id.length > 0,
  );
  return {
    version: 1,
    activeProjectId: typeof source.activeProjectId === 'string' ? source.activeProjectId : null,
    projects,
  };
}

/* ------------------------------------------------------------------ */
/* 原子写入 / 备份                                                     */
/* ------------------------------------------------------------------ */

async function writeFileAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(tmp, payload, 'utf8');
  // rename 在同一目录内，Windows 上是原子替换
  await fsp.rename(tmp, file);
}

function writeFileAtomicSync(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, payload, 'utf8');
  fs.renameSync(tmp, file);
}

async function pruneBackups(projectId: string): Promise<void> {
  let names: string[] = [];
  try {
    names = await fsp.readdir(BACKUP_DIR);
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
  const prefix = `${projectId}-`;
  const mine = names.filter((n) => n.startsWith(prefix) && n.endsWith('.json')).sort();
  const overflow = mine.length - MAX_BACKUPS_PER_PROJECT;
  if (overflow <= 0) return;
  const doomed = mine.slice(0, overflow);
  await Promise.all(
    doomed.map((name) =>
      fsp.rm(path.join(BACKUP_DIR, name), { force: true }).catch((err: unknown) => {
        console.error('[store] 清理旧备份失败', name, err);
      }),
    ),
  );
}

function pruneBackupsSync(projectId: string): void {
  let names: string[] = [];
  try {
    names = fs.readdirSync(BACKUP_DIR);
  } catch (err) {
    if (isNotFound(err)) return;
    return;
  }
  const prefix = `${projectId}-`;
  const mine = names.filter((n) => n.startsWith(prefix) && n.endsWith('.json')).sort();
  const overflow = mine.length - MAX_BACKUPS_PER_PROJECT;
  if (overflow <= 0) return;
  for (const name of mine.slice(0, overflow)) {
    try {
      fs.rmSync(path.join(BACKUP_DIR, name), { force: true });
    } catch {
      // 同步兜底路径，失败不影响主流程
    }
  }
}

/** 覆盖前把旧文件复制到 backups/ 下（同一分钟内多次写入会复用同一个备份名） */
async function backupProjectFile(projectId: string): Promise<void> {
  const file = projectFile(projectId);
  try {
    await fsp.access(file);
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
  try {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const dest = path.join(BACKUP_DIR, `${projectId}-${formatStamp(new Date())}.json`);
    await fsp.copyFile(file, dest);
    await pruneBackups(projectId);
  } catch (err) {
    console.error('[store] 备份失败（不影响主写入）', projectId, err);
  }
}

function backupProjectFileSync(projectId: string): void {
  const file = projectFile(projectId);
  if (!fs.existsSync(file)) return;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = path.join(BACKUP_DIR, `${projectId}-${formatStamp(new Date())}.json`);
    fs.copyFileSync(file, dest);
    pruneBackupsSync(projectId);
  } catch (err) {
    console.error('[store] 同步备份失败（不影响主写入）', projectId, err);
  }
}

/* ------------------------------------------------------------------ */
/* 写入调度                                                            */
/* ------------------------------------------------------------------ */

function enqueueWrite(key: string, task: () => Promise<void>): Promise<void> {
  const prev = writeChains.get(key) ?? Promise.resolve();
  const run = prev.then(task, task).catch((err: unknown) => {
    console.error('[store] 写盘失败', key, err);
  });
  writeChains.set(key, run);
  return run;
}

async function persistProject(projectId: string): Promise<void> {
  const data = projectCache.get(projectId);
  if (!data) return;
  await backupProjectFile(projectId);
  await writeFileAtomic(projectFile(projectId), data);
}

async function persistIndex(): Promise<void> {
  await writeFileAtomic(INDEX_FILE, index);
}

function persistByKey(key: string): Promise<void> {
  return key === INDEX_KEY ? persistIndex() : persistProject(key);
}

function persistByKeySync(key: string): void {
  if (key === INDEX_KEY) {
    writeFileAtomicSync(INDEX_FILE, index);
    return;
  }
  const data = projectCache.get(key);
  if (!data) return;
  backupProjectFileSync(key);
  writeFileAtomicSync(projectFile(key), data);
}

function scheduleSave(key: string): void {
  dirtyKeys.add(key);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    timers.delete(key);
    dirtyKeys.delete(key);
    void enqueueWrite(key, () => persistByKey(key));
  }, DEBOUNCE_MS);
  timers.set(key, timer);
}

function cancelTimer(key: string): void {
  const timer = timers.get(key);
  if (timer) {
    clearTimeout(timer);
    timers.delete(key);
  }
}

async function flushKey(key: string): Promise<void> {
  if (!dirtyKeys.has(key)) return;
  cancelTimer(key);
  dirtyKeys.delete(key);
  await enqueueWrite(key, () => persistByKey(key));
}

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

/** 首次启动：建目录 + 读/初始化 index.json */
export async function init(): Promise<void> {
  if (initialized) return;
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  try {
    const raw = await fsp.readFile(INDEX_FILE, 'utf8');
    index = normalizeIndex(JSON.parse(raw) as unknown);
  } catch (err) {
    if (isNotFound(err)) {
      index = { version: 1, activeProjectId: null, projects: [] };
      await writeFileAtomic(INDEX_FILE, index);
    } else {
      // index 损坏：留个现场再重置，避免整个程序打不开
      const broken = path.join(BACKUP_DIR, `index-broken-${formatStamp(new Date())}.json`);
      try {
        await fsp.copyFile(INDEX_FILE, broken);
      } catch {
        // 备份失败就算了
      }
      console.error('[store] index.json 解析失败，已备份到', broken, '并重置为空索引', err);
      index = { version: 1, activeProjectId: null, projects: [] };
      await writeFileAtomic(INDEX_FILE, index);
    }
  }
  if (index.activeProjectId && !index.projects.some((p) => p.id === index.activeProjectId)) {
    index.activeProjectId = null;
    await writeFileAtomic(INDEX_FILE, index);
  }
  initialized = true;
}

/** 关闭时 flush 所有待写（异步版，SIGINT/SIGTERM 用） */
export async function flushAll(): Promise<void> {
  const keys = [...dirtyKeys];
  for (const key of keys) {
    await flushKey(key);
  }
  await Promise.all([...writeChains.values()]);
}

/** 同步兜底 flush（process.on('exit') 用，此时不能再 await） */
export function flushAllSync(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  const keys = [...dirtyKeys];
  dirtyKeys.clear();
  for (const key of keys) {
    try {
      persistByKeySync(key);
    } catch (err) {
      console.error('[store] 退出前同步落盘失败', key, err);
    }
  }
}

/** 数据目录绝对路径（健康检查 / 设置页展示用） */
export function getDataDir(): string {
  return DATA_DIR;
}

/* ------------------------------------------------------------------ */
/* 索引与项目读取                                                      */
/* ------------------------------------------------------------------ */

export function getIndex(): ProjectIndex {
  ensureInit();
  return { version: 1, activeProjectId: index.activeProjectId, projects: [...index.projects] };
}

export function listProjects(): ProjectSummary[] {
  return getIndex().projects;
}

export function getActiveProjectId(): string | null {
  ensureInit();
  return index.activeProjectId;
}

/** 读项目全量数据；不存在抛 NotFoundError */
export function getProject(projectId: string): ProjectData {
  ensureInit();
  const cached = projectCache.get(projectId);
  if (cached) return cached;

  const file = projectFile(projectId);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (isNotFound(err)) throw new NotFoundError(`项目 ${projectId} 不存在`);
    throw err;
  }
  let parsed: Partial<ProjectData> | null = null;
  try {
    parsed = JSON.parse(raw) as Partial<ProjectData>;
  } catch {
    throw new ApiError(
      'DATA_CORRUPT',
      `项目文件 data/${projectId}.json 解析失败，请检查该文件或从 data/backup 恢复`,
      500,
    );
  }
  const data = normalizeProjectData(projectId, parsed);
  projectCache.set(projectId, data);
  return data;
}

export function findProjectSummary(projectId: string): ProjectSummary | null {
  ensureInit();
  return index.projects.find((p) => p.id === projectId) ?? null;
}

/* ------------------------------------------------------------------ */
/* 项目写入                                                            */
/* ------------------------------------------------------------------ */

export function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  ensureInit();
  const now = new Date().toISOString();
  const id = `p_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const name = input.name.trim();
  const mode: ProjectMode = input.mode === 'free' ? 'free' : 'lock';

  const project: Project = {
    id,
    name,
    targetName: input.targetName.trim(),
    mode,
    scopeNote: (input.scopeNote ?? '').trim(),
    srcUrl: (input.srcUrl ?? '').trim(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const data: ProjectData = {
    project,
    seeds: [],
    assets: [],
    endpoints: [],
    tests: [],
    reports: [],
    reportFiles: [],
    manualEdges: [],
    graphPositions: [],
    features: [],
    activity: [],
    breakLogs: [],
  };

  projectCache.set(id, data);
  index.projects.unshift(toSummary(project));
  dirtyKeys.add(id);
  dirtyKeys.add(INDEX_KEY);

  // 新建项目不能等防抖：立刻落盘，失败要能反馈给用户
  return enqueueWrite(id, () => persistProject(id))
    .then(() => enqueueWrite(INDEX_KEY, () => persistIndex()))
    .then(() => {
      dirtyKeys.delete(id);
      dirtyKeys.delete(INDEX_KEY);
      return toSummary(project);
    });
}

export function updateProject(projectId: string, patch: UpdateProjectInput): ProjectSummary {
  mutateProject(projectId, (data) => {
    const { project } = data;
    if (patch.name !== undefined) project.name = patch.name.trim();
    if (patch.targetName !== undefined) project.targetName = patch.targetName.trim();
    if (patch.mode !== undefined) project.mode = patch.mode;
    if (patch.scopeNote !== undefined) project.scopeNote = patch.scopeNote.trim();
    if (patch.srcUrl !== undefined) project.srcUrl = patch.srcUrl.trim();
    if (patch.status !== undefined) project.status = patch.status;
  });
  // mutateProject 里才刷新 updatedAt，所以摘要要在它之后再取
  return toSummary(getProject(projectId).project);
}

/**
 * 通用改法：给后续块（资产 / 接口 / 矩阵 / 报告 / 图谱）留的统一写入口。
 * fn 里直接改 data，函数返回后自动刷新 updatedAt、同步索引摘要、安排落盘。
 */
export function mutateProject<T>(projectId: string, fn: (data: ProjectData) => T): T {
  ensureInit();
  const data = getProject(projectId);
  const result = fn(data);
  data.project.updatedAt = new Date().toISOString();

  const summary = toSummary(data.project);
  const at = index.projects.findIndex((p) => p.id === projectId);
  if (at >= 0) {
    index.projects[at] = summary;
  } else {
    index.projects.unshift(summary);
  }
  scheduleSave(projectId);
  scheduleSave(INDEX_KEY);
  return result;
}

export async function deleteProject(projectId: string): Promise<void> {
  ensureInit();
  const at = index.projects.findIndex((p) => p.id === projectId);
  if (at < 0) throw new NotFoundError(`项目 ${projectId} 不存在`);

  index.projects.splice(at, 1);
  if (index.activeProjectId === projectId) index.activeProjectId = null;

  projectCache.delete(projectId);
  cancelTimer(projectId);
  dirtyKeys.delete(projectId);

  await fsp.rm(projectFile(projectId), { force: true });

  // 备份一并删掉：删除是不可恢复的，不留半套数据
  try {
    const names = await fsp.readdir(BACKUP_DIR);
    const prefix = `${projectId}-`;
    await Promise.all(
      names
        .filter((n) => n.startsWith(prefix) && n.endsWith('.json'))
        .map((n) => fsp.rm(path.join(BACKUP_DIR, n), { force: true })),
    );
  } catch (err) {
    if (!isNotFound(err)) console.error('[store] 删除备份失败', projectId, err);
  }

  await enqueueWrite(INDEX_KEY, () => persistIndex());
  dirtyKeys.delete(INDEX_KEY);
}

export async function setActiveProject(projectId: string | null): Promise<string | null> {
  ensureInit();
  if (projectId !== null && !index.projects.some((p) => p.id === projectId)) {
    throw new NotFoundError(`项目 ${projectId} 不存在`);
  }
  index.activeProjectId = projectId;
  await enqueueWrite(INDEX_KEY, () => persistIndex());
  dirtyKeys.delete(INDEX_KEY);
  return index.activeProjectId;
}
