/**
 * 资产图谱路由（挂 `/api/projects/:projectId/graph`）。
 *
 * 只持久化两类「用户态」数据：
 * 1. `graphPositions`：节点坐标（首次布局 / 拖拽后写回，pinned 恒为 true）；
 * 2. `manualEdges`：用户手画的横向关联边（7 种内置类型，禁止自由文本）。
 *
 * 拓扑节点与拓扑边不落库：每次进页面从 assets/endpoints/reports 内存重建，
 * 这是 3.12.8 的明确要求（不引图数据库）。
 */

import { randomBytes } from 'crypto';

import { Router } from 'express';
import type { Request, Response } from 'express';

import { RELATION_TYPES } from '../../shared/constants';
import type { ManualEdge, RelationType } from '../../shared/types';
import { NotFoundError, ValidationError, sendOk, wrap } from '../http';
import * as store from '../store';

const router = Router();

const NODE_ID_MAX = 200;
const NOTE_MAX = 500;
const MAX_POSITIONS = 5000;

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

function readEdgeId(req: Request): string {
  const { edgeId } = req.params;
  if (typeof edgeId !== 'string' || !edgeId.trim()) {
    throw new ValidationError('缺少边 id');
  }
  return edgeId.trim();
}

function newSuffix(): string {
  return randomBytes(4).toString('hex');
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${label}必填`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${label}不能为空`);
  if (trimmed.length > max) throw new ValidationError(`${label}不能超过 ${max} 个字符`);
  return trimmed;
}

function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${label}必须是字符串`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${label}不能超过 ${max} 个字符`);
  return trimmed;
}

function finiteNumber(value: unknown, label: string): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) throw new ValidationError(`${label}必须是数字`);
  // 坐标只做展示，限制在合理范围内，避免脏数据把画布撑爆
  if (num < -100000 || num > 100000) throw new ValidationError(`${label}超出允许范围`);
  return Math.round(num * 100) / 100;
}

function requireRelation(value: unknown): RelationType {
  if (typeof value !== 'string' || !RELATION_TYPES.includes(value as RelationType)) {
    throw new ValidationError(`边类型只能是：${RELATION_TYPES.join(' / ')}`);
  }
  return value as RelationType;
}

/* ------------------------------------------------------------------ */
/* 坐标                                                                */
/* ------------------------------------------------------------------ */

/** PUT /api/projects/:projectId/graph/positions */
router.put(
  '/projects/:projectId/graph/positions',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);
    const raw = body.positions;
    if (!Array.isArray(raw)) throw new ValidationError('positions 必须是数组');
    if (raw.length === 0) throw new ValidationError('positions 不能为空');
    if (raw.length > MAX_POSITIONS) {
      throw new ValidationError(`单次最多写 ${MAX_POSITIONS} 个节点坐标`);
    }

    const parsed = raw.map((item, index) => {
      if (!isRecord(item)) throw new ValidationError(`positions 第 ${index + 1} 条必须是对象`);
      return {
        nodeId: requiredText(item.nodeId, `positions 第 ${index + 1} 条的 nodeId`, NODE_ID_MAX),
        x: finiteNumber(item.x, `positions 第 ${index + 1} 条的 x`),
        y: finiteNumber(item.y, `positions 第 ${index + 1} 条的 y`),
      };
    });

    const updated = store.mutateProject(projectId, (data) => {
      let count = 0;
      for (const item of parsed) {
        const existing = data.graphPositions.find((pos) => pos.nodeId === item.nodeId);
        if (existing) {
          existing.x = item.x;
          existing.y = item.y;
          existing.pinned = true;
        } else {
          data.graphPositions.push({
            projectId,
            nodeId: item.nodeId,
            x: item.x,
            y: item.y,
            pinned: true,
          });
        }
        count += 1;
      }
      data.activity.unshift({
        id: `act_${newSuffix()}`,
        projectId,
        at: new Date().toISOString(),
        kind: 'graph',
        summary: `保存图谱坐标 ${count} 个节点`,
        detail: 'graphPositions 已更新',
      });
      if (data.activity.length > 500) data.activity.length = 500;
      return count;
    });

    sendOk(res, { updated });
  }),
);

/* ------------------------------------------------------------------ */
/* 手动边                                                              */
/* ------------------------------------------------------------------ */

/** POST /api/projects/:projectId/graph/edges */
router.post(
  '/projects/:projectId/graph/edges',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const body = readBody(req);

    const source = requiredText(body.source, '起点 nodeId', NODE_ID_MAX);
    const target = requiredText(body.target, '终点 nodeId', NODE_ID_MAX);
    if (source === target) throw new ValidationError('起点和终点不能是同一个节点');
    const relation = requireRelation(body.relation);
    const note = optionalText(body.note, '备注', NOTE_MAX) ?? '';

    const now = new Date().toISOString();
    const edge: ManualEdge = {
      id: `me_${newSuffix()}`,
      projectId,
      source,
      target,
      relation,
      note,
      createdAt: now,
    };

    store.mutateProject(projectId, (data) => {
      data.manualEdges.push(edge);
      data.activity.unshift({
        id: `act_${newSuffix()}`,
        projectId,
        at: now,
        kind: 'graph',
        summary: `新增手动关联「${relation}」`,
        detail: `${source} → ${target}${note ? ` · ${note}` : ''}`,
      });
      if (data.activity.length > 500) data.activity.length = 500;
    });

    sendOk(res, edge, 201);
  }),
);

/** PATCH /api/projects/:projectId/graph/edges/:edgeId */
router.patch(
  '/projects/:projectId/graph/edges/:edgeId',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const edgeId = readEdgeId(req);
    const body = readBody(req);

    const hasRelation = Object.prototype.hasOwnProperty.call(body, 'relation');
    const hasNote = Object.prototype.hasOwnProperty.call(body, 'note');
    if (!hasRelation && !hasNote) throw new ValidationError('没有可更新的字段');

    const relation = hasRelation ? requireRelation(body.relation) : undefined;
    const note = hasNote ? (optionalText(body.note, '备注', NOTE_MAX) ?? '') : undefined;

    const updated = store.mutateProject(projectId, (data) => {
      const edge = data.manualEdges.find((item) => item.id === edgeId);
      if (!edge) throw new NotFoundError(`手动关联 ${edgeId} 不存在`);
      if (relation !== undefined) edge.relation = relation;
      if (note !== undefined) edge.note = note;

      data.activity.unshift({
        id: `act_${newSuffix()}`,
        projectId,
        at: new Date().toISOString(),
        kind: 'graph',
        summary: `更新手动关联「${edge.relation}」`,
        detail: `${edge.source} → ${edge.target}`,
      });
      if (data.activity.length > 500) data.activity.length = 500;
      return edge;
    });

    sendOk(res, updated);
  }),
);

/** DELETE /api/projects/:projectId/graph/edges/:edgeId */
router.delete(
  '/projects/:projectId/graph/edges/:edgeId',
  wrap((req: Request, res: Response) => {
    const projectId = readProjectId(req);
    const edgeId = readEdgeId(req);

    store.mutateProject(projectId, (data) => {
      const index = data.manualEdges.findIndex((item) => item.id === edgeId);
      if (index < 0) throw new NotFoundError(`手动关联 ${edgeId} 不存在`);
      const [removed] = data.manualEdges.splice(index, 1);

      data.activity.unshift({
        id: `act_${newSuffix()}`,
        projectId,
        at: new Date().toISOString(),
        kind: 'graph',
        summary: `删除手动关联「${removed.relation}」`,
        detail: `${removed.source} → ${removed.target}`,
      });
      if (data.activity.length > 500) data.activity.length = 500;
    });

    sendOk(res, { id: edgeId });
  }),
);

export default router;
