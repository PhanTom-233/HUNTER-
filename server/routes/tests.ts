/**
 * 测试矩阵 CRUD + 单元格 upsert / 批量写入。
 *
 * 挂在 `/api` 下：
 * - GET    /api/projects/:projectId/tests?endpointId=&assetId=&vulnType=
 * - POST   /api/projects/:projectId/tests
 * - POST   /api/projects/:projectId/tests/batch
 * - PATCH  /api/projects/:projectId/tests/:id
 * - DELETE /api/projects/:projectId/tests/:id
 *
 * 硬约束：
 * 1. 一个「行（endpointId ?? assetId） × 漏洞类型」只能有一条 TestRecord；
 * 2. N-A 必须带枚举原因，非 N-A 强制清空原因；
 * 3. CLD-07 CORS 是方法论固定不挖列，任何写操作都拒绝；
 * 4. 所有写操作走 store.mutateProject，不直接碰文件。
 */

import { randomBytes } from 'crypto';

import { Router } from 'express';
import type { Request, Response } from 'express';

import { NA_REASONS, TEST_STATES } from '../../shared/constants';
import type {
  NaReason,
  ProjectData,
  TestBatchResult,
  TestRecord,
  TestState,
} from '../../shared/types';
import { VULN_CATALOG_MAP } from '../../shared/vulnCatalog';
import { NotFoundError, ValidationError, sendOk, wrap } from '../http';
import * as store from '../store';

const router = Router();

const ID_MAX = 120;
const TEXT_MAX = 4000;
const BATCH_MAX = 500;
/** 方法论固定不挖：CORS 列只读，任何写操作都拒绝 */
const CORS_VULN_ID = 'CLD-07';

interface NormalizedCell {
  assetId: string;
  endpointId: string | null;
  vulnType: string;
  state: TestState;
  naReason: NaReason | null;
  payload: string;
  baseline: string;
  evidence: string;
  vulnRefId: string | null;
}

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

function readTestId(req: Request): string {
  const { id } = req.params;
  if (typeof id !== 'string' || !id.trim()) {
    throw new ValidationError('缺少测试记录 id');
  }
  return id.trim();
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

function cellKey(endpointId: string | null, assetId: string, vulnType: string): string {
  return `${endpointId ?? assetId}::${vulnType}`;
}

function recordKey(record: TestRecord): string {
  return cellKey(record.endpointId, record.assetId, record.vulnType);
}

function requireAsset(data: ProjectData, assetId: string): void {
  if (!data.assets.some((item) => item.id === assetId)) {
    throw new ValidationError(`资产 ${assetId} 不在当前项目下`);
  }
}

function normalizeEndpointId(
  value: unknown,
  data: ProjectData,
  assetId: string,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError('endpointId 必须是字符串或 null');
  const endpointId = value.trim();
  if (!endpointId) return null;
  if (endpointId.length > ID_MAX) throw new ValidationError('endpointId 过长');
  const endpoint = data.endpoints.find((item) => item.id === endpointId);
  if (!endpoint) throw new ValidationError(`接口 ${endpointId} 不在当前项目下`);
  if (endpoint.assetId !== assetId) {
    throw new ValidationError(`接口 ${endpointId} 不属于资产 ${assetId}`);
  }
  return endpointId;
}

function normalizeVulnType(value: unknown): string {
  const vulnType = requiredString(value, 'vulnType', ID_MAX);
  if (!VULN_CATALOG_MAP[vulnType]) {
    throw new ValidationError(`vulnType ${vulnType} 不在内置漏洞清单中`);
  }
  if (vulnType === CORS_VULN_ID) {
    throw new ValidationError('CORS 按方法论固定不挖，不可修改');
  }
  return vulnType;
}

function normalizeNaReason(state: TestState, value: unknown): NaReason | null {
  if (state !== 'N-A') return null;
  if (value === undefined || value === null || value === '') {
    throw new ValidationError('state 为 N-A 时 naReason 必填');
  }
  return requireEnum<NaReason>(value, NA_REASONS, 'naReason');
}

function normalizeVulnRefId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError('vulnRefId 必须是字符串或 null');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > ID_MAX) throw new ValidationError('vulnRefId 过长');
  return trimmed;
}

/** 创建 / 更新共用；previous 为空表示新建 */
function normalizeFields(
  body: Record<string, unknown>,
  data: ProjectData,
  previous?: TestRecord,
): NormalizedCell {
  if (previous && previous.vulnType === CORS_VULN_ID) {
    throw new ValidationError('CORS 按方法论固定不挖，不可修改');
  }

  const assetId = has(body, 'assetId')
    ? requiredString(body.assetId, 'assetId', ID_MAX)
    : (previous?.assetId ?? '');
  if (!assetId) throw new ValidationError('assetId 必填');
  requireAsset(data, assetId);

  let endpointId: string | null;
  if (has(body, 'endpointId')) {
    endpointId = normalizeEndpointId(body.endpointId, data, assetId);
  } else if (previous) {
    endpointId = normalizeEndpointId(previous.endpointId, data, assetId);
  } else {
    endpointId = null;
  }

  const vulnType = has(body, 'vulnType')
    ? normalizeVulnType(body.vulnType)
    : (previous?.vulnType ?? '');
  if (!vulnType) throw new ValidationError('vulnType 必填');
  if (vulnType === CORS_VULN_ID) {
    throw new ValidationError('CORS 按方法论固定不挖，不可修改');
  }

  const state = has(body, 'state')
    ? requireEnum<TestState>(body.state, TEST_STATES, 'state')
    : (previous?.state ?? (() => {
        throw new ValidationError('state 必填');
      })());

  const naReasonInput = has(body, 'naReason') ? body.naReason : previous?.naReason;
  const naReason = normalizeNaReason(state, naReasonInput);

  return {
    assetId,
    endpointId,
    vulnType,
    state,
    naReason,
    payload: has(body, 'payload')
      ? optionalString(body.payload, 'payload', TEXT_MAX)
      : (previous?.payload ?? ''),
    baseline: has(body, 'baseline')
      ? optionalString(body.baseline, 'baseline', TEXT_MAX)
      : (previous?.baseline ?? ''),
    evidence: has(body, 'evidence')
      ? optionalString(body.evidence, 'evidence', TEXT_MAX)
      : (previous?.evidence ?? ''),
    vulnRefId: has(body, 'vulnRefId')
      ? normalizeVulnRefId(body.vulnRefId)
      : (previous?.vulnRefId ?? null),
  };
}

function toRecord(
  fields: NormalizedCell,
  projectId: string,
  id: string,
  createdAt: string,
): TestRecord {
  return {
    id,
    projectId,
    assetId: fields.assetId,
    endpointId: fields.endpointId,
    vulnType: fields.vulnType,
    state: fields.state,
    naReason: fields.naReason,
    payload: fields.payload,
    baseline: fields.baseline,
    evidence: fields.evidence,
    vulnRefId: fields.vulnRefId,
    createdAt,
  };
}

/** 同一格只保留一条记录：命中即更新第一条并清掉历史重复 */
function upsertCell(
  data: ProjectData,
  fields: NormalizedCell,
  projectId: string,
  now: string,
): { record: TestRecord; created: boolean } {
  const key = cellKey(fields.endpointId, fields.assetId, fields.vulnType);
  const matches = data.tests.filter((item) => recordKey(item) === key);

  if (matches.length > 0) {
    const keep = matches[0];
    Object.assign(keep, {
      assetId: fields.assetId,
      endpointId: fields.endpointId,
      vulnType: fields.vulnType,
      state: fields.state,
      naReason: fields.naReason,
      payload: fields.payload,
      baseline: fields.baseline,
      evidence: fields.evidence,
      vulnRefId: fields.vulnRefId,
    });
    data.tests = data.tests.filter((item) => item === keep || recordKey(item) !== key);
    return { record: keep, created: false };
  }

  const record = toRecord(fields, projectId, `tr_${newSuffix()}`, now);
  data.tests.push(record);
  return { record, created: true };
}

function addActivity(data: ProjectData, projectId: string, summary: string, detail: string): void {
  data.activity.unshift({
    id: `act_${newSuffix()}`,
    projectId,
    at: new Date().toISOString(),
    kind: 'test',
    summary,
    detail,
  });
  if (data.activity.length > 500) data.activity.length = 500;
}

/* ------------------------------------------------------------------ */
/* 列表                                                                */
/* ------------------------------------------------------------------ */

router.get(
  '/projects/:projectId/tests',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const data = store.getProject(projectId);
    const endpointId = typeof req.query.endpointId === 'string' ? req.query.endpointId.trim() : '';
    const assetId = typeof req.query.assetId === 'string' ? req.query.assetId.trim() : '';
    const vulnType = typeof req.query.vulnType === 'string' ? req.query.vulnType.trim() : '';

    let items = data.tests;
    if (endpointId) items = items.filter((item) => item.endpointId === endpointId);
    if (assetId) items = items.filter((item) => item.assetId === assetId);
    if (vulnType) items = items.filter((item) => item.vulnType === vulnType);
    sendOk(res, items);
  }),
);

/* ------------------------------------------------------------------ */
/* 单元格 upsert / 批量写入                                             */
/* ------------------------------------------------------------------ */

router.post(
  '/projects/:projectId/tests',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const result = store.mutateProject(projectId, (data) => {
      const fields = normalizeFields(body, data);
      const outcome = upsertCell(data, fields, projectId, new Date().toISOString());
      addActivity(
        data,
        projectId,
        `${outcome.created ? '新增' : '更新'}测试格 ${fields.vulnType}`,
        `行：${fields.endpointId ?? fields.assetId} · 状态：${fields.state}`,
      );
      return outcome;
    });
    sendOk(res, result.record, result.created ? 201 : 200);
  }),
);

router.post(
  '/projects/:projectId/tests/batch',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const rawCells = body.cells;
    if (!Array.isArray(rawCells)) throw new ValidationError('cells 必须是数组');
    if (rawCells.length === 0) throw new ValidationError('cells 不能为空');
    if (rawCells.length > BATCH_MAX) {
      throw new ValidationError(`单次最多提交 ${BATCH_MAX} 个单元格`);
    }
    const cells = rawCells.map((item, index) => {
      if (!isRecord(item)) throw new ValidationError(`第 ${index + 1} 个单元格必须是对象`);
      return item;
    });

    const result = store.mutateProject(projectId, (data) => {
      // 先整批校验，再整批写入：任一格非法时不留下半截内存改动
      const normalizedCells = cells.map((cell) => normalizeFields(cell, data));
      const now = new Date().toISOString();
      const records: TestRecord[] = [];
      let created = 0;
      let updated = 0;
      for (const fields of normalizedCells) {
        const outcome = upsertCell(data, fields, projectId, now);
        if (outcome.created) created += 1;
        else updated += 1;
        records.push(outcome.record);
      }
      addActivity(data, projectId, `批量写入测试格 ${cells.length} 个`, `新增 ${created} / 更新 ${updated}`);
      const payload: TestBatchResult = { updated, created, records };
      return payload;
    });
    sendOk(res, result, 201);
  }),
);

/* ------------------------------------------------------------------ */
/* 更新 / 删除                                                         */
/* ------------------------------------------------------------------ */

router.patch(
  '/projects/:projectId/tests/:id',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const id = readTestId(req);
    const body = readBody(req);

    const updated = store.mutateProject(projectId, (data) => {
      const current = data.tests.find((item) => item.id === id);
      if (!current) throw new NotFoundError(`测试记录 ${id} 不存在`);
      const fields = normalizeFields(body, data, current);
      const key = cellKey(fields.endpointId, fields.assetId, fields.vulnType);
      const duplicate = data.tests.some(
        (item) => item.id !== current.id && recordKey(item) === key,
      );
      if (duplicate) throw new ValidationError('该单元格已有测试记录，请改用单元格 upsert');
      Object.assign(current, fields);
      addActivity(data, projectId, `更新测试格 ${fields.vulnType}`, `状态：${fields.state}`);
      return current;
    });
    sendOk(res, updated);
  }),
);

router.delete(
  '/projects/:projectId/tests/:id',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const id = readTestId(req);

    store.mutateProject(projectId, (data) => {
      const current = data.tests.find((item) => item.id === id);
      if (!current) throw new NotFoundError(`测试记录 ${id} 不存在`);
      if (current.vulnType === CORS_VULN_ID) {
        throw new ValidationError('CORS 按方法论固定不挖，不可修改');
      }
      data.tests = data.tests.filter((item) => item.id !== id);
      addActivity(data, projectId, `清除测试格 ${current.vulnType}`, '格子恢复为未测');
    });
    sendOk(res, { id });
  }),
);

export default router;
