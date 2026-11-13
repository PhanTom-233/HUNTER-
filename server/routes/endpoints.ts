/**
 * 接口清单 CRUD + 批量导入路由。
 *
 * 挂在 `/api` 下：
 * - GET    /api/projects/:projectId/endpoints?assetId=
 * - POST   /api/projects/:projectId/endpoints
 * - POST   /api/projects/:projectId/endpoints/import
 * - POST   /api/projects/:projectId/endpoints/batch-access
 * - PATCH  /api/projects/:projectId/endpoints/:endpointId
 * - DELETE /api/projects/:projectId/endpoints/:endpointId
 *
 * 红线：导入是纯字符串解析，绝不对目标发任何请求。
 */

import { randomBytes } from 'crypto';

import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  ACCESS_STATES,
  ENDPOINT_SOURCES,
  HTTP_METHODS,
  PARAM_LOCATIONS,
  RESP_SIGNATURES,
} from '../../shared/constants';
import type {
  AccessState,
  Asset,
  Endpoint,
  EndpointImportDraft,
  EndpointImportError,
  EndpointImportFormat,
  EndpointImportResult,
  EndpointSource,
  HttpMethod,
  Param,
  ParamLocation,
  ProjectData,
  RespSignature,
} from '../../shared/types';
import { NotFoundError, ValidationError, sendOk, wrap } from '../http';
import { parseEndpointImport } from '../endpointImport';
import * as store from '../store';

const router = Router();

const PATH_MAX = 2000;
const FULL_URL_MAX = 2000;
const NOTE_MAX = 500;
const TYPE_MAX = 40;
const NAME_MAX = 120;
const IMPORT_TEXT_MAX = 2_000_000;
const BATCH_MAX = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(req: Request): Record<string, unknown> {
  const raw: unknown = req.body;
  if (!isRecord(raw)) throw new ValidationError('请求体必须是 JSON 对象');
  return raw;
}

function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

function newSuffix(): string {
  return randomBytes(4).toString('hex');
}

function readProjectId(req: Request): string {
  const { projectId } = req.params;
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new ValidationError('缺少项目 id');
  }
  return projectId.trim();
}

function readEndpointId(req: Request): string {
  const { endpointId } = req.params;
  if (typeof endpointId !== 'string' || !endpointId.trim()) {
    throw new ValidationError('缺少接口 id');
  }
  return endpointId.trim();
}

function requiredString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${label}必填`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${label}不能为空`);
  if (trimmed.length > max) throw new ValidationError(`${label}不能超过 ${max} 个字符`);
  return trimmed;
}

function optionalString(value: unknown, label: string, max: number): string {
  if (value === undefined || value === null) return '';
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

function requireAsset(data: ProjectData, assetId: string): Asset {
  const asset = data.assets.find((item) => item.id === assetId);
  if (!asset) throw new ValidationError(`资产 ${assetId} 不在当前项目下`);
  return asset;
}

function normalizeParams(value: unknown, label: string): Param[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${label}必须是数组`);
  if (value.length > 200) throw new ValidationError(`${label}最多 200 条`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new ValidationError(`第 ${index + 1} 个参数必须是对象`);
    const name = requiredString(item.name, `第 ${index + 1} 个参数的 name`, NAME_MAX);
    const location = requireEnum<ParamLocation>(
      item.in,
      PARAM_LOCATIONS,
      `第 ${index + 1} 个参数的 in`,
    );
    const type = optionalString(item.type, `第 ${index + 1} 个参数的 type`, TYPE_MAX) || 'string';
    if (typeof item.isBusiness !== 'boolean') {
      throw new ValidationError(`第 ${index + 1} 个参数的 isBusiness 必须是布尔值`);
    }
    return { name, in: location, type, isBusiness: item.isBusiness };
  });
}

function normalizeKeys(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${label}必须是数组`);
  if (value.length > 100) throw new ValidationError(`${label}最多 100 条`);
  return value.map((item, index) => {
    if (typeof item !== 'string') throw new ValidationError(`${label}第 ${index + 1} 条必须是字符串`);
    return item.trim().slice(0, NAME_MAX);
  });
}

function buildFullUrl(asset: Asset, path: string, provided: string): string {
  if (provided) return provided.slice(0, FULL_URL_MAX);
  if (/^https?:\/\//i.test(path)) return path.slice(0, FULL_URL_MAX);
  if (!asset.url) return '';
  try {
    return new URL(path, asset.url).toString().slice(0, FULL_URL_MAX);
  } catch {
    return `${asset.url.replace(/\/$/, '')}${path}`.slice(0, FULL_URL_MAX);
  }
}

function deriveDiffSurface(
  respSignature: RespSignature,
  params: Param[],
  explicit: boolean | undefined,
): boolean {
  // 方法论硬规则：仅登录码是同闸，四件套整段 N/A；空列表/500/超时是有差分面，必须测
  if (respSignature === '仅登录码') return false;
  if (respSignature === '空列表' || respSignature === '报错500' || respSignature === '超时') {
    return true;
  }
  if (typeof explicit === 'boolean') return explicit;
  return params.some((param) => param.isBusiness);
}

interface NormalizedFields {
  assetId: string;
  featureId: string | null;
  method: HttpMethod;
  path: string;
  fullUrl: string;
  source: EndpointSource;
  params: Param[];
  accessState: AccessState;
  respSignature: RespSignature;
  diffSurface: boolean;
  keys: string[];
  note: string;
}

/** 创建 / 更新共用；previous 为空表示新建，必填字段更严格 */
function normalizeFields(
  body: Record<string, unknown>,
  data: ProjectData,
  previous?: Endpoint,
): NormalizedFields {
  const isCreate = !previous;
  if (isCreate && !has(body, 'assetId')) throw new ValidationError('assetId 必填');
  if (isCreate && !has(body, 'method')) throw new ValidationError('method 必填');
  if (isCreate && !has(body, 'path')) throw new ValidationError('path 不能为空');
  if (isCreate && !has(body, 'source')) throw new ValidationError('source 必填');

  const assetId = has(body, 'assetId')
    ? requiredString(body.assetId, 'assetId', NAME_MAX)
    : (previous?.assetId as string);
  const asset = requireAsset(data, assetId);

  const method = has(body, 'method')
    ? requireEnum<HttpMethod>(body.method, HTTP_METHODS, 'method')
    : (previous?.method as HttpMethod);
  const path = has(body, 'path')
    ? requiredString(body.path, 'path', PATH_MAX)
    : (previous?.path as string);
  if (!path) throw new ValidationError('path 不能为空');
  const source = has(body, 'source')
    ? requireEnum<EndpointSource>(body.source, ENDPOINT_SOURCES, 'source')
    : (previous?.source as EndpointSource);

  let featureId: string | null = previous?.featureId ?? null;
  if (has(body, 'featureId')) {
    const raw = body.featureId;
    if (raw === null || raw === '') {
      featureId = null;
    } else {
      const value = requiredString(raw, 'featureId', NAME_MAX);
      if (!data.features.some((feature) => feature.id === value)) {
        throw new ValidationError(`功能点 ${value} 不在当前项目下`);
      }
      featureId = value;
    }
  }

  const params = has(body, 'params')
    ? normalizeParams(body.params, 'params')
    : (previous?.params ?? []);
  const keys = has(body, 'keys') ? normalizeKeys(body.keys, 'keys') : (previous?.keys ?? []);
  const note = has(body, 'note')
    ? optionalString(body.note, 'note', NOTE_MAX)
    : (previous?.note ?? '');
  const accessState = has(body, 'accessState')
    ? requireEnum<AccessState>(body.accessState, ACCESS_STATES, 'accessState')
    : (previous?.accessState ?? '未测试');
  const respSignature = has(body, 'respSignature')
    ? requireEnum<RespSignature>(body.respSignature, RESP_SIGNATURES, 'respSignature')
    : (previous?.respSignature ?? '静态HTML');

  const providedFullUrl = has(body, 'fullUrl')
    ? optionalString(body.fullUrl, 'fullUrl', FULL_URL_MAX)
    : '';
  const fullUrl = buildFullUrl(asset, path, providedFullUrl || previous?.fullUrl || '');

  let explicitDiff: boolean | undefined;
  if (has(body, 'diffSurface')) {
    if (typeof body.diffSurface !== 'boolean') {
      throw new ValidationError('diffSurface 必须是布尔值');
    }
    explicitDiff = body.diffSurface;
  }

  return {
    assetId,
    featureId,
    method,
    path,
    fullUrl,
    source,
    params,
    accessState,
    respSignature,
    diffSurface: deriveDiffSurface(respSignature, params, explicitDiff),
    keys,
    note,
  };
}

function toEndpoint(fields: NormalizedFields, projectId: string, id: string, createdAt: string): Endpoint {
  return {
    id,
    projectId,
    assetId: fields.assetId,
    featureId: fields.featureId,
    method: fields.method,
    path: fields.path,
    fullUrl: fields.fullUrl,
    source: fields.source,
    params: fields.params,
    accessState: fields.accessState,
    respSignature: fields.respSignature,
    diffSurface: fields.diffSurface,
    keys: fields.keys,
    note: fields.note,
    createdAt,
  };
}

function addActivity(data: ProjectData, projectId: string, summary: string, detail: string): void {
  data.activity.unshift({
    id: `act_${newSuffix()}`,
    projectId,
    at: new Date().toISOString(),
    kind: 'endpoint',
    summary,
    detail,
  });
  if (data.activity.length > 500) data.activity.length = 500;
}

/* ------------------------------------------------------------------ */
/* 列表 / 创建                                                         */
/* ------------------------------------------------------------------ */

/** GET /api/projects/:projectId/endpoints?assetId= */
router.get(
  '/projects/:projectId/endpoints',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const data = store.getProject(projectId);
    const assetId = typeof req.query.assetId === 'string' ? req.query.assetId.trim() : '';
    if (assetId) requireAsset(data, assetId);
    const items = assetId
      ? data.endpoints.filter((item) => item.assetId === assetId)
      : data.endpoints;
    sendOk(res, items);
  }),
);

/** POST /api/projects/:projectId/endpoints */
router.post(
  '/projects/:projectId/endpoints',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const now = new Date().toISOString();
    const endpoint = store.mutateProject(projectId, (data) => {
      const fields = normalizeFields(body, data);
      const created = toEndpoint(fields, projectId, `ep_${newSuffix()}`, now);
      data.endpoints.push(created);
      addActivity(data, projectId, `新增接口 ${created.method} ${created.path}`, `来源：${created.source}`);
      return created;
    });
    sendOk(res, endpoint, 201);
  }),
);

/* ------------------------------------------------------------------ */
/* 批量导入（纯字符串解析，永不发请求）                                  */
/* ------------------------------------------------------------------ */

function draftToBody(draft: EndpointImportDraft): Record<string, unknown> {
  return {
    assetId: draft.assetId,
    featureId: draft.featureId,
    method: draft.method,
    path: draft.path,
    fullUrl: draft.fullUrl,
    source: draft.source,
    params: draft.params,
    accessState: draft.accessState,
    respSignature: draft.respSignature,
    diffSurface: draft.diffSurface,
    keys: draft.keys,
    note: draft.note,
  };
}

/** POST /api/projects/:projectId/endpoints/import */
router.post(
  '/projects/:projectId/endpoints/import',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const assetId = requiredString(body.assetId, 'assetId', NAME_MAX);
    const format = requireEnum<EndpointImportFormat>(
      body.format,
      ['path', 'curl', 'swagger'] as const,
      'format',
    );
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text) throw new ValidationError('导入内容不能为空');
    if (text.length > IMPORT_TEXT_MAX) throw new ValidationError('导入内容过大');
    const dryRun = body.dryRun === true;

    const data = store.getProject(projectId);
    const asset = requireAsset(data, assetId);
    const parsed = parseEndpointImport(format, text, assetId, asset.url);

    const errors: EndpointImportError[] = [...parsed.errors];
    const validDrafts: EndpointImportDraft[] = [];
    let skipped = parsed.skipped;

    // 再过一次统一校验，解析器漏掉的坏草稿在这里挡掉，不让整批 500
    parsed.drafts.forEach((draft, index) => {
      try {
        normalizeFields(draftToBody(draft), data);
        validDrafts.push(draft);
      } catch (error) {
        skipped += 1;
        errors.push({
          line: index + 1,
          reason: error instanceof Error ? error.message : '草稿校验失败',
        });
      }
    });

    let created: Endpoint[] = [];
    if (!dryRun && validDrafts.length > 0) {
      const now = new Date().toISOString();
      created = store.mutateProject(projectId, (mutable) => {
        const list = validDrafts.map((draft) =>
          toEndpoint(
            normalizeFields(draftToBody(draft), mutable),
            projectId,
            `ep_${newSuffix()}`,
            now,
          ),
        );
        mutable.endpoints.push(...list);
        addActivity(
          mutable,
          projectId,
          `批量导入接口 ${list.length} 条`,
          `格式：${format} · 跳过 ${skipped} 行`,
        );
        return list;
      });
    }

    const result: EndpointImportResult = {
      format,
      successCount: validDrafts.length,
      skipped,
      errors,
      drafts: validDrafts,
      created,
    };
    sendOk(res, result, dryRun ? 200 : 201);
  }),
);

/* ------------------------------------------------------------------ */
/* 批量设可访问性                                                      */
/* ------------------------------------------------------------------ */

/** POST /api/projects/:projectId/endpoints/batch-access */
router.post(
  '/projects/:projectId/endpoints/batch-access',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('ids 不能为空');
    if (ids.length > BATCH_MAX) throw new ValidationError(`单次最多改 ${BATCH_MAX} 条`);
    if (!ids.every((item) => typeof item === 'string' && item.trim())) {
      throw new ValidationError('ids 必须是非空字符串数组');
    }
    const accessState = requireEnum<AccessState>(
      body.accessState,
      ACCESS_STATES,
      'accessState',
    );
    const idSet = new Set((ids as string[]).map((item) => item.trim()));

    const updated = store.mutateProject(projectId, (data) => {
      let count = 0;
      for (const endpoint of data.endpoints) {
        if (!idSet.has(endpoint.id)) continue;
        endpoint.accessState = accessState;
        count += 1;
      }
      addActivity(data, projectId, `批量设可访问性 ${count} 条`, `统一改为 ${accessState}`);
      return count;
    });
    sendOk(res, { updated });
  }),
);

/* ------------------------------------------------------------------ */
/* 更新 / 删除                                                         */
/* ------------------------------------------------------------------ */

/** PATCH /api/projects/:projectId/endpoints/:endpointId */
router.patch(
  '/projects/:projectId/endpoints/:endpointId',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const endpointId = readEndpointId(req);
    const body = readBody(req);

    const updated = store.mutateProject(projectId, (data) => {
      const current = data.endpoints.find((item) => item.id === endpointId);
      if (!current) throw new NotFoundError(`接口 ${endpointId} 不存在`);
      const fields = normalizeFields(body, data, current);
      Object.assign(current, fields);
      addActivity(data, projectId, `更新接口 ${current.method} ${current.path}`, endpointId);
      return current;
    });
    sendOk(res, updated);
  }),
);

/** DELETE /api/projects/:projectId/endpoints/:endpointId */
router.delete(
  '/projects/:projectId/endpoints/:endpointId',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const endpointId = readEndpointId(req);

    store.mutateProject(projectId, (data) => {
      const index = data.endpoints.findIndex((item) => item.id === endpointId);
      if (index < 0) throw new NotFoundError(`接口 ${endpointId} 不存在`);
      const [removed] = data.endpoints.splice(index, 1);

      // 清掉下游引用，避免测试记录 / 报告指向已删接口
      data.tests = data.tests.map((item) =>
        item.endpointId === endpointId ? { ...item, endpointId: null } : item,
      );
      data.reports = data.reports.map((item) =>
        item.endpointId === endpointId ? { ...item, endpointId: null } : item,
      );
      addActivity(
        data,
        projectId,
        `删除接口 ${removed.method} ${removed.path}`,
        '已清掉测试记录 / 报告里的 endpointId 引用',
      );
    });

    sendOk(res, { id: endpointId });
  }),
);

export default router;
