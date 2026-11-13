/**
 * 资产 CRUD + 指纹库 / 漏洞清单字典路由。
 *
 * 挂在 `/api` 下：
 * - GET    /api/fingerprints
 * - GET    /api/vuln-catalog
 * - GET    /api/projects/:projectId/assets
 * - POST   /api/projects/:projectId/assets
 * - PATCH  /api/projects/:projectId/assets/:assetId
 * - DELETE /api/projects/:projectId/assets/:assetId
 *
 * 硬约束（对应方法论 3.4 / 3.5 / 3.7）：
 * 1. 派生字段（fingerprints / attackSurface / vulnRefs）**不信任前端**，一律用 `deriveFromFp` 重算；
 * 2. 历史漏洞同 id 的 `status` 必须保留用户改过的值；
 * 3. `covered` 只由 11 项 checklist 是否全 true 决定，前端只展示；
 * 4. 删除资产要连带删掉挂在它下面的 endpoints / tests / reports / features。
 */

import { randomBytes } from 'crypto';

import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  ALIVE_STATUSES,
  ASSET_CATEGORY_KEYS,
  ASSET_HOST_MAX,
  ASSET_NAME_MAX,
  ASSET_NOTE_MAX,
  ASSET_PROTOCOL_MAX,
  ASSET_SAME_SKIN_MAX,
  ASSET_TITLE_MAX,
  ASSET_URL_MAX,
  CHECKLIST_ITEMS,
  FP_CATEGORIES,
  FP_CATEGORY_KEYS,
  FP_EVIDENCE_MAX,
  FP_NAME_MAX,
  FP_VERSION_MAX,
  OWNERSHIPS,
  VULN_REF_STATUSES,
  VULN_SEVERITIES,
  VULN_SOURCES,
} from '../../shared/constants';
import {
  deriveFromFp,
  deriveWeight,
  emptyFingerprints,
  mergeVulnRefs,
} from '../../shared/fpDerive';
import { FINGERPRINT_LIBRARY } from '../../shared/fingerprints';
import type {
  Asset,
  AssetBrief,
  AssetCategory,
  AssetChecklist,
  AssetFingerprints,
  AssetOwnership,
  AssetWeight,
  AliveStatus,
  FingerprintConfidence,
  FpCategoryKey,
  FpItem,
  VulnRef,
} from '../../shared/types';
import { VULN_CATALOG } from '../../shared/vulnCatalog';
import { NotFoundError, ValidationError, sendOk, wrap } from '../http';
import * as store from '../store';

const router = Router();

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const HOSTNAME = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/* ------------------------------------------------------------------ */
/* 通用小工具                                                          */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(req: Request): Record<string, unknown> {
  const raw: unknown = req.body;
  if (!isRecord(raw)) throw new ValidationError('请求体必须是 JSON 对象');
  return raw;
}

/** 字段是否由前端显式传了（null 也算传了，表示要清空） */
function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

function newSuffix(): string {
  return randomBytes(4).toString('hex');
}

function requiredString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${label}必填`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${label}不能为空`);
  if (trimmed.length > max) throw new ValidationError(`${label}不能超过 ${max} 个字符`);
  return trimmed;
}

function optionalString(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${label}必须是字符串`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${label}不能超过 ${max} 个字符`);
  return trimmed;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`${label}只能是：${allowed.join(' / ')}`);
  }
  return value as T;
}

function optionalUrl(value: unknown): string {
  const text = optionalString(value, 'URL', ASSET_URL_MAX) ?? '';
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) {
    throw new ValidationError('URL 必须以 http:// 或 https:// 开头');
  }
  try {
    // eslint-disable-next-line no-new
    new URL(text);
  } catch {
    throw new ValidationError('URL 不是合法的地址');
  }
  return text;
}

/**
 * URL → host / port / protocol 兜底解析。
 *
 * 前端编辑抽屉会解析一次，但接口创建、外部导入、脚本调用都不会走前端，
 * 所以服务端必须再兜一次；解析失败返回 null，调用方保持原值不报错。
 */
function parseUrlFallback(
  url: string,
): { host: string; port: number | null; protocol: string; portExplicit: boolean } | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(':', '').toLowerCase();
    const portExplicit = parsed.port !== '';
    const port = portExplicit
      ? Number(parsed.port)
      : protocol === 'https'
        ? 443
        : protocol === 'http'
          ? 80
          : null;
    if (!parsed.hostname) return null;
    return {
      host: parsed.hostname,
      port: Number.isInteger(port) ? port : null,
      protocol,
      portExplicit,
    };
  } catch {
    return null;
  }
}

/** 宽松校验：IPv4 或域名/主机名（别误杀 intranet-db01 这种内网机器名） */
function optionalIp(value: unknown): string {
  const text = optionalString(value, 'IP / 主机名', ASSET_HOST_MAX) ?? '';
  if (!text) return '';
  if (IPV4.test(text)) {
    const octets = text.split('.').map((part) => Number(part));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      throw new ValidationError('IP 每段必须在 0-255 之间');
    }
    return text;
  }
  if (HOSTNAME.test(text)) return text;
  throw new ValidationError('IP 必须是 IPv4（如 10.0.0.8）或域名 / 主机名（如 intranet-db01）');
}

function optionalPort(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(num) || num < 0 || num > 65535) {
    throw new ValidationError('端口必须是 0-65535 之间的整数');
  }
  return num;
}

function normalizeBrief(raw: unknown): AssetBrief {
  if (raw === undefined || raw === null) {
    return { user: '', objects: '', money: '', preAuth: '' };
  }
  if (!isRecord(raw)) throw new ValidationError('「说清这摊」必须是对象');
  return {
    user: optionalString(raw.user, '谁在用', ASSET_NOTE_MAX) ?? '',
    objects: optionalString(raw.objects, '核心对象', ASSET_NOTE_MAX) ?? '',
    money: optionalString(raw.money, '钱权状态落在哪', ASSET_NOTE_MAX) ?? '',
    preAuth: optionalString(raw.preAuth, '没登录能碰到哪层', ASSET_NOTE_MAX) ?? '',
  };
}

/* ------------------------------------------------------------------ */
/* 指纹 / 历史漏洞规范化                                               */
/* ------------------------------------------------------------------ */

function normalizeFpItem(raw: unknown, key: FpCategoryKey, index: number): FpItem {
  if (!isRecord(raw)) {
    throw new ValidationError(`技术栈「${key}」第 ${index + 1} 条必须是对象`);
  }
  const name = requiredString(raw.name, `技术栈「${key}」第 ${index + 1} 条的名称`, FP_NAME_MAX);
  const version = optionalString(raw.version, '指纹版本号', FP_VERSION_MAX) ?? '';
  const evidence = optionalString(raw.evidence, '判定依据', FP_EVIDENCE_MAX) ?? '';

  let confidence: FingerprintConfidence = '确认';
  if (raw.confidence !== undefined) {
    if (raw.confidence !== '确认' && raw.confidence !== '疑似') {
      throw new ValidationError('指纹置信度只能是「确认」或「疑似」');
    }
    confidence = raw.confidence;
  }

  const id =
    typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `fpi_${newSuffix()}`;

  return { id, name, version, evidence, confidence };
}

/** 只允许 16 个 key；每条必须名称；同栏同名去重报错 */
function normalizeFp(raw: unknown): AssetFingerprints {
  if (raw === undefined || raw === null) return emptyFingerprints();
  if (!isRecord(raw)) throw new ValidationError('技术栈必须是对象');

  const unknownKeys = Object.keys(raw).filter(
    (key) => !FP_CATEGORY_KEYS.includes(key as FpCategoryKey),
  );
  if (unknownKeys.length > 0) {
    throw new ValidationError(`技术栈含未知分栏：${unknownKeys.join('、')}`);
  }

  const result = emptyFingerprints();
  for (const key of FP_CATEGORY_KEYS) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) throw new ValidationError(`技术栈「${key}」必须是数组`);

    const seen = new Set<string>();
    const items: FpItem[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item = normalizeFpItem(value[index], key, index);
      if (seen.has(item.name)) {
        throw new ValidationError(`技术栈「${key}」里「${item.name}」重复了，同一条指纹只留一条`);
      }
      seen.add(item.name);
      items.push(item);
    }
    result[key] = items;
  }
  return result;
}

function normalizeVulnRefs(raw: unknown): VulnRef[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError('历史漏洞必须是数组');

  return raw.map((item, index) => {
    if (!isRecord(item)) {
      throw new ValidationError(`历史漏洞第 ${index + 1} 条必须是对象`);
    }
    const name = requiredString(item.name, `历史漏洞第 ${index + 1} 条的名称`, 200);
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `vr_${newSuffix()}`;
    const source =
      item.source === undefined ? '经验' : requireEnum(item.source, VULN_SOURCES, '漏洞来源');
    const severity =
      item.severity === undefined ? '中危' : requireEnum(item.severity, VULN_SEVERITIES, '漏洞等级');
    const status =
      item.status === undefined
        ? '待验证'
        : requireEnum(item.status, VULN_REF_STATUSES, '漏洞状态');

    return {
      id,
      fingerprintId: typeof item.fingerprintId === 'string' ? item.fingerprintId : '',
      name,
      source,
      identifier: optionalString(item.identifier, '漏洞编号', 100) ?? '',
      affectedVersion: optionalString(item.affectedVersion, '影响版本', 200) ?? '',
      severity,
      condition: optionalString(item.condition, '利用条件', 500) ?? '',
      verifyPath: optionalString(item.verifyPath, '验证方向', 500) ?? '',
      kbModule: optionalString(item.kbModule, '知识库模块', 100) ?? '',
      status,
    };
  });
}

function emptyChecklist(): AssetChecklist {
  const checklist = {} as AssetChecklist;
  for (const { key } of CHECKLIST_ITEMS) checklist[key] = false;
  return checklist;
}

function normalizeChecklist(raw: unknown, base: AssetChecklist): AssetChecklist {
  const result = { ...base };
  if (raw === undefined || raw === null) return result;
  if (!isRecord(raw)) throw new ValidationError('「本轮完成」清单必须是对象');
  for (const { key } of CHECKLIST_ITEMS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      throw new ValidationError(`「本轮完成」清单项 ${key} 必须是布尔值`);
    }
    result[key] = value;
  }
  return result;
}

function isChecklistDone(checklist: AssetChecklist): boolean {
  return CHECKLIST_ITEMS.every(({ key }) => checklist[key]);
}

/* ------------------------------------------------------------------ */
/* 字段应用 + 派生重算                                                 */
/* ------------------------------------------------------------------ */

interface ApplyResult {
  fpChanged: boolean;
  categoryChanged: boolean;
}

/** 两个 16 栏技术栈是否等价（name/version/evidence/confidence 全一致） */
function fingerprintEquals(a: AssetFingerprints, b: AssetFingerprints): boolean {
  for (const key of FP_CATEGORY_KEYS) {
    const left = a[key] ?? [];
    const right = b[key] ?? [];
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const l = left[index];
      const r = right[index];
      if (
        l.name !== r.name ||
        l.version !== r.version ||
        l.evidence !== r.evidence ||
        l.confidence !== r.confidence
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 把请求体里出现的字段写到资产上（PATCH 语义），返回是否需要重算派生字段。
 * 新建时先构造一个默认资产再调它，保证两条路径共用同一套校验。
 */
function applyAssetFields(target: Asset, body: Record<string, unknown>): ApplyResult {
  let fpChanged = false;
  let categoryChanged = false;
  const portProvided = has(body, 'port');

  if (has(body, 'name')) {
    target.name = requiredString(body.name, '资产名称', ASSET_NAME_MAX);
  }
  if (has(body, 'url')) target.url = optionalUrl(body.url);
  if (has(body, 'host')) target.host = optionalString(body.host, 'host', ASSET_HOST_MAX) ?? '';
  if (has(body, 'ip')) target.ip = optionalIp(body.ip);
  if (has(body, 'port')) target.port = optionalPort(body.port);
  if (has(body, 'protocol')) {
    target.protocol = optionalString(body.protocol, '协议', ASSET_PROTOCOL_MAX) ?? '';
  }
  if (has(body, 'title')) {
    target.title = optionalString(body.title, '页面标题', ASSET_TITLE_MAX) ?? '';
  }
  if (has(body, 'category')) {
    const next = requireEnum<AssetCategory>(body.category, ASSET_CATEGORY_KEYS, '资产类别');
    if (next !== target.category) categoryChanged = true;
    target.category = next;
  }
  if (has(body, 'weight')) {
    target.weight = requireEnum<AssetWeight>(body.weight, ['fat', 'thin'], '肥瘦');
  }
  if (has(body, 'ownership')) {
    target.ownership = requireEnum<AssetOwnership>(body.ownership, OWNERSHIPS, '归属');
  }
  if (has(body, 'aliveStatus')) {
    target.aliveStatus = requireEnum<AliveStatus>(body.aliveStatus, ALIVE_STATUSES, '存活状态');
  }
  if (has(body, 'sameSkinGroup')) {
    target.sameSkinGroup = optionalString(body.sameSkinGroup, '同皮组', ASSET_SAME_SKIN_MAX) ?? '';
  }
  if (has(body, 'riskNote')) {
    target.riskNote = optionalString(body.riskNote, '风险备注', ASSET_NOTE_MAX) ?? '';
  }
  if (has(body, 'brief')) target.brief = normalizeBrief(body.brief);
  if (has(body, 'seedId')) {
    target.seedId =
      typeof body.seedId === 'string' && body.seedId.trim() ? body.seedId.trim() : null;
  }
  if (has(body, 'fp')) {
    // 只有技术栈真的变了才重算：前端保存时会带上完整的 fp，
    // 如果无脑重算，用户刚删掉的历史漏洞会被「原地复活」。
    const next = normalizeFp(body.fp);
    fpChanged = !fingerprintEquals(target.fp, next);
    target.fp = next;
  }
  if (has(body, 'vulnRefs')) {
    target.vulnRefs = normalizeVulnRefs(body.vulnRefs);
  }
  if (has(body, 'checklist')) {
    target.checklist = normalizeChecklist(body.checklist, target.checklist);
  }

  // host 为空而 URL 非空 → 服务端兜底解析 host / port / protocol。
  // 前端编辑抽屉也会解析，但接口创建、外部导入、脚本调用都不会走前端，这里必须再兜一次。
  if (!target.host && target.url) {
    const fallback = parseUrlFallback(target.url);
    if (fallback) {
      target.host = fallback.host;
      // URL 里写了端口就听 URL 的；没写端口时只在原本为空的情况下补 443/80，
      // 免得把用户手填的端口覆盖掉。
      if (!portProvided && (fallback.portExplicit || target.port === null)) {
        target.port = fallback.port;
      }
      if (!has(body, 'protocol') && !target.protocol) target.protocol = fallback.protocol;
    }
  }

  return { fpChanged, categoryChanged };
}

/** 用指纹库重算 labels / attackSurface / vulnRefs（历史漏洞同 id 状态保留） */
function recomputeDerived(asset: Asset): void {
  const derived = deriveFromFp(asset.fp, FINGERPRINT_LIBRARY, asset.vulnRefs);
  asset.fingerprints = derived.labels;
  asset.attackSurface = derived.attackSurface;
  asset.vulnRefs = mergeVulnRefs(derived.vulnRefs, asset.vulnRefs);
}

/** covered 由 checklist 决定；服务端算，前端只展示 */
function recomputeCovered(
  asset: Asset,
  previousCovered: boolean,
  previousCoveredAt: string | null,
): void {
  const done = isChecklistDone(asset.checklist);
  asset.covered = done;
  if (!done) {
    asset.coveredAt = null;
    return;
  }
  asset.coveredAt =
    previousCovered && previousCoveredAt ? previousCoveredAt : new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* 参数读取                                                            */
/* ------------------------------------------------------------------ */

function readProjectId(req: Request): string {
  const { projectId } = req.params;
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new ValidationError('缺少项目 id');
  }
  return projectId.trim();
}

function readAssetId(req: Request): string {
  const { assetId } = req.params;
  if (typeof assetId !== 'string' || !assetId.trim()) {
    throw new ValidationError('缺少资产 id');
  }
  return assetId.trim();
}

/* ------------------------------------------------------------------ */
/* 字典路由                                                            */
/* ------------------------------------------------------------------ */

/** GET /api/fingerprints —— 16 类 + 全部指纹条目 */
router.get('/fingerprints', (_req: Request, res: Response) => {
  sendOk(res, { categories: FP_CATEGORIES, items: FINGERPRINT_LIBRARY });
});

/** GET /api/vuln-catalog —— 3.11 的 A~F 全部条目 */
router.get('/vuln-catalog', (_req: Request, res: Response) => {
  sendOk(res, { items: VULN_CATALOG });
});

/* ------------------------------------------------------------------ */
/* 资产 CRUD                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/projects/:projectId/assets —— 按 updatedAt 倒序 */
router.get(
  '/projects/:projectId/assets',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const data = store.getProject(projectId);
    const assets = [...data.assets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    sendOk(res, assets);
  }),
);

/** POST /api/projects/:projectId/assets */
router.post(
  '/projects/:projectId/assets',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const name = requiredString(body.name, '资产名称', ASSET_NAME_MAX);
    const now = new Date().toISOString();

    const asset: Asset = {
      id: `a_${newSuffix()}`,
      projectId,
      seedId: null,
      name,
      url: '',
      host: '',
      ip: '',
      port: null,
      protocol: '',
      title: '',
      category: 'big_system',
      weight: 'fat',
      fingerprints: [],
      fp: emptyFingerprints(),
      ownership: '未知',
      aliveStatus: '未探活',
      sameSkinGroup: '',
      brief: { user: '', objects: '', money: '', preAuth: '' },
      attackSurface: [],
      vulnRefs: [],
      covered: false,
      coveredAt: null,
      checklist: emptyChecklist(),
      riskNote: '',
      createdAt: now,
      updatedAt: now,
    };

    applyAssetFields(asset, body);
    // 名称在上面已经校验过，这里再挡一次「只传了空格」的极端情况
    if (!asset.name) throw new ValidationError('资产名称必填');

    // 类别未显式传时用默认 big_system 的推导值；显式传了 weight 就尊重用户
    if (!has(body, 'weight')) asset.weight = deriveWeight(asset.category);

    recomputeDerived(asset);
    recomputeCovered(asset, false, null);

    store.mutateProject(projectId, (data) => {
      data.assets.unshift(asset);
      data.activity.unshift({
        id: `act_${newSuffix()}`,
        projectId,
        at: now,
        kind: 'asset',
        summary: `新增资产 ${asset.name}`,
        detail: `${asset.category} · ${asset.url || asset.host || '未填地址'}`,
      });
      if (data.activity.length > 500) data.activity.length = 500;
    });

    sendOk(res, asset, 201);
  }),
);

/** PATCH /api/projects/:projectId/assets/:assetId */
router.patch(
  '/projects/:projectId/assets/:assetId',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const assetId = readAssetId(req);
    const body = readBody(req);

    const touchedKeys = Object.keys(body);
    if (touchedKeys.length === 0) throw new ValidationError('没有可更新的字段');

    const updated = store.mutateProject(projectId, (data) => {
      const asset = data.assets.find((item) => item.id === assetId);
      if (!asset) throw new NotFoundError(`资产 ${assetId} 不存在`);

      const previousCovered = asset.covered;
      const previousCoveredAt = asset.coveredAt;

      const result = applyAssetFields(asset, body);

      // 类别改了但没显式改肥瘦 → 回到该类别默认值
      if (result.categoryChanged && !has(body, 'weight')) {
        asset.weight = deriveWeight(asset.category);
      }

      // 类别只影响默认肥瘦；labels / attackSurface / vulnRefs 只由指纹决定，
      // 所以只有指纹真的变了才重算（避免把用户删掉的历史漏洞又带回来）。
      if (result.fpChanged) {
        recomputeDerived(asset);
      }
      recomputeCovered(asset, previousCovered, previousCoveredAt);
      asset.updatedAt = new Date().toISOString();

      data.activity.unshift({
        id: `act_${newSuffix()}`,
        projectId,
        at: asset.updatedAt,
        kind: 'asset',
        summary: `更新资产 ${asset.name}`,
        detail: touchedKeys.join('、'),
      });
      if (data.activity.length > 500) data.activity.length = 500;

      return asset;
    });

    sendOk(res, updated);
  }),
);

/** DELETE /api/projects/:projectId/assets/:assetId —— 连带删掉下属实体 */
router.delete(
  '/projects/:projectId/assets/:assetId',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const assetId = readAssetId(req);

    store.mutateProject(projectId, (data) => {
      const index = data.assets.findIndex((item) => item.id === assetId);
      if (index < 0) throw new NotFoundError(`资产 ${assetId} 不存在`);
      const [removed] = data.assets.splice(index, 1);

      // 本轮这几个数组还是空的，但代码先写好：删资产必须级联，不能留孤儿记录
      data.endpoints = data.endpoints.filter((item) => item.assetId !== assetId);
      data.tests = data.tests.filter((item) => item.assetId !== assetId);
      data.reports = data.reports.filter((item) => item.assetId !== assetId);
      data.features = data.features.filter((item) => item.assetId !== assetId);

      const now = new Date().toISOString();
      data.activity.unshift({
        id: `act_${newSuffix()}`,
        projectId,
        at: now,
        kind: 'asset',
        summary: `删除资产 ${removed.name}`,
        detail: '已连带删除该资产下的接口 / 测试记录 / 报告 / 功能点',
      });
      if (data.activity.length > 500) data.activity.length = 500;
    });

    sendOk(res, { id: assetId });
  }),
);

export default router;
