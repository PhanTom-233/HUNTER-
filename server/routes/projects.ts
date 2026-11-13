/**
 * 项目 CRUD 路由。
 *
 * 校验一律在服务端做（前端只是提前提示），错误信息用中文，前端直接展示。
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { APP_VERSION, PROJECT_NAME_MAX, TARGET_NAME_MAX } from '../../shared/constants';
import type {
  ActivatePayload,
  CreateProjectInput,
  HealthPayload,
  ProjectListPayload,
  ProjectMode,
  ProjectStatus,
  UpdateProjectInput,
} from '../../shared/types';
import {
  NotFoundError,
  ValidationError,
  sendOk,
  wrap,
} from '../http';
import * as store from '../store';

const router = Router();

const SRC_URL_MAX = 500;
const NOTE_MAX = 2000;

const MODES: ProjectMode[] = ['lock', 'free'];
const STATUSES: ProjectStatus[] = ['active', 'paused', 'archived'];

/* ------------------------------------------------------------------ */
/* 校验小工具                                                          */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(req: Request): Record<string, unknown> {
  const raw: unknown = req.body;
  if (!isRecord(raw)) {
    throw new ValidationError('请求体必须是 JSON 对象');
  }
  return raw;
}

function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

/** 必填字符串：trim 后长度 1..max */
function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${label}必填`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${label}不能为空`);
  if (trimmed.length > max) throw new ValidationError(`${label}不能超过 ${max} 个字符`);
  return trimmed;
}

/** 可选字符串：未传返回 undefined；传了但超长直接报错 */
function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${label}必须是字符串`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${label}不能超过 ${max} 个字符`);
  return trimmed;
}

function requireMode(value: unknown): ProjectMode {
  if (typeof value !== 'string' || !MODES.includes(value as ProjectMode)) {
    throw new ValidationError('模式只能是 lock（锁面）或 free（自由跳）');
  }
  return value as ProjectMode;
}

function requireStatus(value: unknown): ProjectStatus {
  if (typeof value !== 'string' || !STATUSES.includes(value as ProjectStatus)) {
    throw new ValidationError('项目状态只能是 active / paused / archived');
  }
  return value as ProjectStatus;
}

/** SRC 地址可空；非空时必须是 http:// 或 https:// 开头 */
function validateSrcUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) {
    throw new ValidationError('SRC 地址必须以 http:// 或 https:// 开头');
  }
  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    throw new ValidationError('SRC 地址不是合法的 URL');
  }
  return value;
}

function readId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id.trim()) {
    throw new ValidationError('缺少项目 id');
  }
  return id.trim();
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

/** GET /api/health */
router.get('/health', (_req: Request, res: Response) => {
  const payload: HealthPayload = {
    status: 'ok',
    version: APP_VERSION,
    time: new Date().toISOString(),
  };
  sendOk(res, payload);
});

/** GET /api/projects */
router.get(
  '/projects',
  wrap((_req: Request, res: Response) => {
    const payload: ProjectListPayload = {
      projects: store.listProjects(),
      activeProjectId: store.getActiveProjectId(),
    };
    sendOk(res, payload);
  }),
);

/** POST /api/projects */
router.post(
  '/projects',
  wrap(async (req: Request, res: Response) => {
    const body = readBody(req);

    const input: CreateProjectInput = {
      name: requiredText(body.name, '项目名称', PROJECT_NAME_MAX),
      targetName: requiredText(body.targetName, '目标名称', TARGET_NAME_MAX),
      mode: has(body, 'mode') ? requireMode(body.mode) : 'lock',
      scopeNote: optionalText(body.scopeNote, '授权范围说明', NOTE_MAX) ?? '',
      srcUrl: validateSrcUrl(optionalText(body.srcUrl, 'SRC 地址', SRC_URL_MAX)) ?? '',
    };

    const summary = await store.createProject(input);
    sendOk(res, summary, 201);
  }),
);

/** GET /api/projects/:id */
router.get(
  '/projects/:id',
  wrap((req: Request, res: Response) => {
    const id = readId(req);
    sendOk(res, store.getProject(id));
  }),
);

/** PATCH /api/projects/:id */
router.patch(
  '/projects/:id',
  wrap((req: Request, res: Response) => {
    const id = readId(req);
    const body = readBody(req);

    const patch: UpdateProjectInput = {};
    let touched = 0;

    if (has(body, 'name')) {
      patch.name = requiredText(body.name, '项目名称', PROJECT_NAME_MAX);
      touched += 1;
    }
    if (has(body, 'targetName')) {
      patch.targetName = requiredText(body.targetName, '目标名称', TARGET_NAME_MAX);
      touched += 1;
    }
    if (has(body, 'mode')) {
      patch.mode = requireMode(body.mode);
      touched += 1;
    }
    if (has(body, 'scopeNote')) {
      patch.scopeNote = optionalText(body.scopeNote, '授权范围说明', NOTE_MAX) ?? '';
      touched += 1;
    }
    if (has(body, 'srcUrl')) {
      patch.srcUrl = validateSrcUrl(optionalText(body.srcUrl, 'SRC 地址', SRC_URL_MAX)) ?? '';
      touched += 1;
    }
    if (has(body, 'status')) {
      patch.status = requireStatus(body.status);
      touched += 1;
    }

    if (touched === 0) {
      throw new ValidationError('没有可更新的字段');
    }

    // 先确认存在，错误码才能是 404 而不是写入时抛
    if (!store.findProjectSummary(id)) {
      throw new NotFoundError(`项目 ${id} 不存在`);
    }

    sendOk(res, store.updateProject(id, patch));
  }),
);

/** DELETE /api/projects/:id */
router.delete(
  '/projects/:id',
  wrap(async (req: Request, res: Response) => {
    const id = readId(req);
    if (!store.findProjectSummary(id)) {
      throw new NotFoundError(`项目 ${id} 不存在`);
    }
    await store.deleteProject(id);
    const payload: ActivatePayload = { activeProjectId: store.getActiveProjectId() };
    sendOk(res, payload);
  }),
);

/** PUT /api/projects/:id/activate */
router.put(
  '/projects/:id/activate',
  wrap(async (req: Request, res: Response) => {
    const id = readId(req);
    if (!store.findProjectSummary(id)) {
      throw new NotFoundError(`项目 ${id} 不存在`);
    }
    await store.setActiveProject(id);
    const payload: ActivatePayload = { activeProjectId: store.getActiveProjectId() };
    sendOk(res, payload);
  }),
);

export default router;
