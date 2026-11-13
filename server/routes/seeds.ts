/**
 * 种子队列：项目级 CRUD + doing 唯一 / 破闸 / 未完成活面统计。
 *
 * 三条硬约束都在服务端兜住：
 * 1. 同时只允许一个 doing；另一个 doing 还有未闭环活面时返回 409；
 * 2. doing 还有活面时新增 pending 允许，但打 gateBroken 并写 BreakLog；
 * 3. P2 未活筛只在 UI 禁用扩面，后端不额外加 done 限制。
 */

import { randomBytes } from 'crypto';

import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  SEED_ALIVE_FILTERS,
  SEED_SOURCES,
  SEED_STATUSES,
  SEED_TYPES,
} from '../../shared/constants';
import type {
  Asset,
  BreakLog,
  ProjectData,
  Seed,
  SeedAliveFilter,
  SeedListPayload,
  SeedPriority,
  SeedSource,
  SeedStatus,
} from '../../shared/types';
import { ApiError, NotFoundError, ValidationError, sendOk, wrap } from '../http';
import * as store from '../store';

const router = Router();

const KEYWORD_MAX = 80;
const HOST_MAX = 200;
const NOTE_MAX = 500;
const ALIVE_SURFACE = new Set<Asset['aliveStatus']>(['存活', '401', '403', '登录墙']);

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

function readSeedId(req: Request): string {
  const { id } = req.params;
  if (typeof id !== 'string' || !id.trim()) throw new ValidationError('缺少种子 id');
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

function optionalInt(value: unknown, label: string, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new ValidationError(`${label}必须是非负整数`);
  }
  return num;
}

function isAliveSurface(asset: Asset): boolean {
  return ALIVE_SURFACE.has(asset.aliveStatus);
}

function unfinishedOf(data: ProjectData, seedId: string): Asset[] {
  return data.assets.filter(
    (asset) => asset.seedId === seedId && !asset.covered && isAliveSurface(asset),
  );
}

function doingSeedOf(data: ProjectData): Seed | null {
  return data.seeds.find((seed) => seed.status === 'doing') ?? null;
}

function seedCounts(data: ProjectData): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const seed of data.seeds) {
    counts[seed.id] = unfinishedOf(data, seed.id).length;
  }
  return counts;
}

function gateBusy(data: ProjectData, targetSeedId: string | null = null): { doing: Seed; assets: Asset[] } | null {
  const doing = data.seeds.find(
    (seed) => seed.status === 'doing' && seed.id !== targetSeedId,
  );
  if (!doing) return null;
  const assets = unfinishedOf(data, doing.id);
  return assets.length > 0 ? { doing, assets } : null;
}

function throwGateBusy(busy: { doing: Seed; assets: Asset[] }): never {
  throw new ApiError(
    'SEED_GATE_BUSY',
    `当前种子还有 ${busy.assets.length} 个活面未闭环`,
    409,
    {
      doingSeedId: busy.doing.id,
      unfinishedAssets: busy.assets.map((asset) => ({ id: asset.id, name: asset.name })),
    },
  );
}

function normalizeFields(
  body: Record<string, unknown>,
  previous?: Seed,
): {
  keyword: string;
  type: SeedPriority;
  status: SeedStatus;
  source: SeedSource;
  parentHost: string | null;
  poolSize: number;
  aliveFilter: SeedAliveFilter;
  note: string;
} {
  const keyword = has(body, 'keyword')
    ? requiredString(body.keyword, 'keyword', KEYWORD_MAX)
    : (previous?.keyword ?? '');
  if (!keyword) throw new ValidationError('keyword 必填');

  const type = has(body, 'type')
    ? requireEnum<SeedPriority>(body.type, SEED_TYPES, 'type')
    : (previous?.type ?? (() => {
        throw new ValidationError('type 必填');
      })());
  const status = has(body, 'status')
    ? requireEnum<SeedStatus>(body.status, SEED_STATUSES, 'status')
    : (previous?.status ?? 'pending');
  const source = has(body, 'source')
    ? requireEnum<SeedSource>(body.source, SEED_SOURCES, 'source')
    : (previous?.source ?? (() => {
        throw new ValidationError('source 必填');
      })());
  const parentHostRaw = has(body, 'parentHost')
    ? body.parentHost
    : (previous?.parentHost ?? null);
  const parentHost =
    parentHostRaw === undefined || parentHostRaw === null || parentHostRaw === ''
      ? null
      : requiredString(parentHostRaw, 'parentHost', HOST_MAX);
  const poolSize = has(body, 'poolSize')
    ? optionalInt(body.poolSize, 'poolSize', 0)
    : (previous?.poolSize ?? 0);
  const aliveFilter = has(body, 'aliveFilter')
    ? requireEnum<SeedAliveFilter>(body.aliveFilter, SEED_ALIVE_FILTERS, 'aliveFilter')
    : (previous?.aliveFilter ?? '未筛');
  const note = has(body, 'note')
    ? optionalString(body.note, 'note', NOTE_MAX)
    : (previous?.note ?? '');

  return { keyword, type, status, source, parentHost, poolSize, aliveFilter, note };
}

function applyDoingTransition(data: ProjectData, target: Seed): void {
  const busy = gateBusy(data, target.id);
  if (busy) throwGateBusy(busy);
  const now = new Date().toISOString();
  for (const seed of data.seeds) {
    if (seed.id !== target.id && seed.status === 'doing' && unfinishedOf(data, seed.id).length === 0) {
      seed.status = 'done';
      seed.updatedAt = now;
    }
  }
  target.status = 'doing';
  target.updatedAt = now;
}

function addActivity(data: ProjectData, projectId: string, summary: string, detail: string): void {
  data.activity.unshift({
    id: `act_${newSuffix()}`,
    projectId,
    at: new Date().toISOString(),
    kind: 'seed',
    summary,
    detail,
  });
  if (data.activity.length > 500) data.activity.length = 500;
}

/* ------------------------------------------------------------------ */
/* 列表                                                                */
/* ------------------------------------------------------------------ */

router.get(
  '/projects/:projectId/seeds',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const data = store.getProject(projectId);
    const type = typeof req.query.type === 'string' && req.query.type.trim()
      ? requireEnum<SeedPriority>(req.query.type.trim(), SEED_TYPES, 'type')
      : '';
    const status = typeof req.query.status === 'string' && req.query.status.trim()
      ? requireEnum<SeedStatus>(req.query.status.trim(), SEED_STATUSES, 'status')
      : '';

    let items = data.seeds;
    if (type) items = items.filter((seed) => seed.type === type);
    if (status) items = items.filter((seed) => seed.status === status);

    const doing = doingSeedOf(data);
    const payload: SeedListPayload = {
      items,
      doing,
      unfinishedAssets: doing ? unfinishedOf(data, doing.id) : [],
      breakLogs: data.breakLogs,
      counts: seedCounts(data),
    };
    sendOk(res, payload);
  }),
);

/* ------------------------------------------------------------------ */
/* 创建                                                                */
/* ------------------------------------------------------------------ */

router.post(
  '/projects/:projectId/seeds',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const created = store.mutateProject(projectId, (data) => {
      const fields = normalizeFields(body);
      const now = new Date().toISOString();
      const seed: Seed = {
        id: `seed_${newSuffix()}`,
        projectId,
        keyword: fields.keyword,
        type: fields.type,
        status: fields.status,
        source: fields.source,
        parentHost: fields.parentHost,
        poolSize: fields.poolSize,
        aliveFilter: fields.aliveFilter,
        gateBroken: false,
        note: fields.note,
        createdAt: now,
        updatedAt: now,
      };

      if (seed.status === 'doing') {
        applyDoingTransition(data, seed);
      } else {
        const busy = gateBusy(data);
        if (seed.status === 'pending' && busy) {
          seed.gateBroken = true;
          const log: BreakLog = {
            id: `bl_${newSuffix()}`,
            projectId,
            at: now,
            doingSeedId: busy.doing.id,
            pendingSeedId: seed.id,
            unfinishedAssetIds: busy.assets.map((asset) => asset.id),
            note: `当前种子还有 ${busy.assets.length} 个活面未闭环`,
          };
          data.breakLogs.unshift(log);
        }
      }

      data.seeds.push(seed);
      addActivity(
        data,
        projectId,
        `新增种子 ${seed.keyword}`,
        `${seed.type} · ${seed.status}${seed.gateBroken ? ' · 破闸' : ''}`,
      );
      return seed;
    });
    sendOk(res, created, 201);
  }),
);

/* ------------------------------------------------------------------ */
/* 更新 / 状态 / 删除                                                   */
/* ------------------------------------------------------------------ */

router.patch(
  '/projects/:projectId/seeds/:id',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const id = readSeedId(req);
    const body = readBody(req);
    const updated = store.mutateProject(projectId, (data) => {
      const seed = data.seeds.find((item) => item.id === id);
      if (!seed) throw new NotFoundError(`种子 ${id} 不存在`);
      const fields = normalizeFields(body, seed);

      if (fields.status === 'doing') {
        applyDoingTransition(data, seed);
      } else {
        seed.status = fields.status;
      }

      Object.assign(seed, {
        keyword: fields.keyword,
        type: fields.type,
        source: fields.source,
        parentHost: fields.parentHost,
        poolSize: fields.poolSize,
        aliveFilter: fields.aliveFilter,
        note: fields.note,
        updatedAt: new Date().toISOString(),
      });
      addActivity(data, projectId, `更新种子 ${seed.keyword}`, `状态：${seed.status}`);
      return seed;
    });
    sendOk(res, updated);
  }),
);

router.post(
  '/projects/:projectId/seeds/:id/status',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const id = readSeedId(req);
    const body = readBody(req);
    const status = requireEnum<SeedStatus>(body.status, SEED_STATUSES, 'status');

    const updated = store.mutateProject(projectId, (data) => {
      const seed = data.seeds.find((item) => item.id === id);
      if (!seed) throw new NotFoundError(`种子 ${id} 不存在`);
      if (status === 'doing') applyDoingTransition(data, seed);
      else {
        seed.status = status;
        seed.updatedAt = new Date().toISOString();
      }
      addActivity(data, projectId, `种子状态改为 ${status}`, seed.keyword);
      return seed;
    });
    sendOk(res, updated);
  }),
);

router.delete(
  '/projects/:projectId/seeds/:id',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const id = readSeedId(req);
    store.mutateProject(projectId, (data) => {
      const seed = data.seeds.find((item) => item.id === id);
      if (!seed) throw new NotFoundError(`种子 ${id} 不存在`);
      data.seeds = data.seeds.filter((item) => item.id !== id);
      data.assets = data.assets.map((asset) =>
        asset.seedId === id ? { ...asset, seedId: null, updatedAt: new Date().toISOString() } : asset,
      );
      addActivity(data, projectId, `删除种子 ${seed.keyword}`, '关联资产的 seedId 已置空');
    });
    sendOk(res, { id });
  }),
);

export default router;
