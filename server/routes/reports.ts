/**
 * docx 报告入口：创建 / 列表 / 打开 / 删除。
 *
 * 项目 JSON 只登记 fileName，不存正文、不存绝对路径；
 * 打开与删除都必须先做 basename + resolve 前缀校验，防路径穿越。
 */

import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { ProjectData, ReportFile, ReportFileView } from '../../shared/types';
import { ApiError, NotFoundError, ValidationError, sendOk, wrap } from '../http';
import * as store from '../store';

const router = Router();

const SKILL_DIR = path.join(process.cwd(), 'skill');
const REPORTS_DIR = process.env.HUNTER_REPORTS_DIR
  ? path.resolve(process.env.HUNTER_REPORTS_DIR)
  : path.join(process.cwd(), 'reports');

const NAME_MAX = 80;

interface SkillIndexShape {
  templates?: {
    reportDocx?: string;
  };
}

function readSkillIndex(): SkillIndexShape {
  const file = path.join(SKILL_DIR, 'index.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as SkillIndexShape;
  } catch {
    throw new ApiError('SKILL_INDEX_MISSING', '内置方法论索引缺失，无法创建报告模板', 500);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(req: Request): Record<string, unknown> {
  const raw: unknown = req.body;
  if (!isRecord(raw)) throw new ValidationError('请求体必须是 JSON 对象');
  return raw;
}

function readProjectId(req: Request): string {
  const { projectId } = req.params;
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new ValidationError('缺少项目 id');
  }
  return projectId.trim();
}

function readReportId(req: Request): string {
  const { id } = req.params;
  if (typeof id !== 'string' || !id.trim()) throw new ValidationError('缺少报告 id');
  return id.trim();
}

function stamp(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('报告名称必填');
  const cleaned = value.replace(/[\\/:*?"<>|\r\n]/g, '').trim().slice(0, NAME_MAX);
  if (!cleaned) throw new ValidationError('报告名称不能为空');
  return cleaned;
}

function ensureReportsDir(): void {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/** fileName 只允许是 reports/ 下的单层文件名 */
function resolveReportPath(fileName: string): string {
  if (!fileName || path.basename(fileName) !== fileName) {
    throw new ValidationError('报告文件名不合法');
  }
  const root = path.resolve(REPORTS_DIR);
  const target = path.resolve(root, fileName);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new ValidationError('报告文件路径越界');
  }
  return target;
}

function findReportFile(id: string): { projectId: string; data: ProjectData; file: ReportFile } {
  for (const summary of store.listProjects()) {
    const data = store.getProject(summary.id);
    const file = data.reportFiles.find((item) => item.id === id);
    if (file) return { projectId: summary.id, data, file };
  }
  throw new NotFoundError(`报告 ${id} 不存在`);
}

function openWithSystem(target: string): void {
  const command =
    process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';

  if (process.platform === 'linux') {
    const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
    const exists = dirs.some((dir) => fs.existsSync(path.join(dir, command)));
    if (!exists) throw new ValidationError('未找到系统打开程序（xdg-open）');
  }

  try {
    const child = spawn(command, [target], { detached: true, stdio: 'ignore' });
    child.on('error', (error: Error) => {
      console.error('[reports] 打开系统程序失败', error.message);
    });
    child.unref();
  } catch {
    throw new ValidationError('未找到系统打开程序');
  }
}

/* ------------------------------------------------------------------ */
/* 创建 / 列表                                                         */
/* ------------------------------------------------------------------ */

router.post(
  '/reports',
  wrap(async (req: Request, res: Response) => {
    const body = readBody(req);
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
    if (!projectId) throw new ValidationError('projectId 必填');
    const name = sanitizeName(body.name);
    store.getProject(projectId);

    const index = readSkillIndex();
    const template = index.templates?.reportDocx;
    if (!template) {
      throw new ApiError('REPORT_TEMPLATE_MISSING', '内置报告模板未在索引中登记', 500);
    }

    ensureReportsDir();
    const fileName = `${projectId}-${stamp()}-${randomBytes(2).toString('hex')}.docx`;
    const source = path.join(SKILL_DIR, template);
    const target = resolveReportPath(fileName);
    try {
      fs.copyFileSync(source, target);
    } catch {
      throw new ApiError('REPORT_TEMPLATE_COPY_FAILED', '内置报告模板复制失败', 500);
    }

    const file: ReportFile = {
      id: `rf_${randomBytes(4).toString('hex')}`,
      name,
      fileName,
      createdAt: new Date().toISOString(),
    };
    store.mutateProject(projectId, (data) => {
      data.reportFiles.push(file);
    });
    await store.flushAll();
    sendOk(res, file, 201);
  }),
);

router.get(
  '/projects/:projectId/reports',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const data = store.getProject(projectId);
    const items: ReportFileView[] = data.reportFiles.map((file) => {
      try {
        const target = resolveReportPath(file.fileName);
        const stat = fs.statSync(target);
        return { ...file, size: stat.isFile() ? stat.size : null, missing: false };
      } catch {
        return { ...file, size: null, missing: true };
      }
    });
    sendOk(res, items);
  }),
);

/* ------------------------------------------------------------------ */
/* 打开 / 删除                                                         */
/* ------------------------------------------------------------------ */

router.post(
  '/reports/:id/open',
  wrap((req: Request, res: Response) => {
    const id = readReportId(req);
    const found = findReportFile(id);
    const target = resolveReportPath(found.file.fileName);
    if (!fs.existsSync(target)) throw new ValidationError('报告文件不存在，可能已被移动或删除');
    openWithSystem(target);
    sendOk(res, { opened: true });
  }),
);

router.delete(
  '/reports/:id',
  wrap(async (req: Request, res: Response) => {
    const id = readReportId(req);
    const deleteFile = req.query.deleteFile === '1' || req.query.deleteFile === 'true';
    const found = findReportFile(id);

    let fileDeleted = false;
    if (deleteFile) {
      const target = resolveReportPath(found.file.fileName);
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        fileDeleted = true;
      }
    }

    store.mutateProject(found.projectId, (data) => {
      data.reportFiles = data.reportFiles.filter((item) => item.id !== id);
    });
    await store.flushAll();
    sendOk(res, { removed: true, fileDeleted });
  }),
);

export default router;
