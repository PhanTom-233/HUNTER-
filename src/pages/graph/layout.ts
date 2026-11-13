/**
 * 布局：elkjs 分层 + 新节点补位 + 力导向（环形降级）。
 *
 * 3.12.5 的硬约束：
 * - 首次布局只跑一次，跑完把坐标写回 graphPositions；
 * - 之后进页面，有存档坐标的节点一律用存档，只给新节点找空位；
 * - 切换布局算法必须先确认，确认后才全量重排并覆盖。
 *
 * elkjs 必须用 `elk.bundled.js`，否则 Vite 里 worker 路径会炸。
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge } from '@xyflow/react';

import type { GraphPosition } from '../../../shared/types';
import type { GraphNode } from './buildNodes';

export const NODE_W = 190;
export const NODE_H = 56;
export const GAP_X = 60;
export const GAP_Y = 90;

export type LayoutMode = 'layered' | 'force';

export interface XY {
  x: number;
  y: number;
}

export interface PlanResult {
  positions: Record<string, XY>;
  /** 是否需要把坐标整体写回（首次布局 / 有新节点 / 主动重排） */
  saveAll: boolean;
  /** 本次新补位的节点 id */
  missing: string[];
}

/** 从没有入边的节点开始 BFS，得到层级（用于新节点补位与环形布局） */
export function computeDepth(nodes: GraphNode[], edges: Edge[]): Map<string, number> {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const list = children.get(edge.source) ?? [];
    list.push(edge.target);
    children.set(edge.source, list);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of ids) {
    if ((indegree.get(id) ?? 0) === 0) {
      depth.set(id, 0);
      queue.push(id);
    }
  }
  // 兜底：全是环（理论上拓扑边不会）时也能给出 0 层
  if (queue.length === 0 && ids.size > 0) {
    const first = nodes[0].id;
    depth.set(first, 0);
    queue.push(first);
  }

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentDepth = depth.get(current) ?? 0;
    for (const child of children.get(current) ?? []) {
      const next = currentDepth + 1;
      if ((depth.get(child) ?? Number.POSITIVE_INFINITY) <= next) continue;
      depth.set(child, next);
      queue.push(child);
    }
  }
  for (const id of ids) {
    if (!depth.has(id)) depth.set(id, 0);
  }
  return depth;
}

async function layeredLayout(nodes: GraphNode[], edges: Edge[]): Promise<Record<string, XY>> {
  const elk = new ELK();
  const graph = {
    id: '@root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': String(GAP_X),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(GAP_Y),
      'elk.layered.nodePlacement.strategy': 'SIMPLE',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((node) => ({ id: node.id, width: NODE_W, height: NODE_H })),
    edges: edges.map((edge, index) => ({
      id: `le-${index}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const positions: Record<string, XY> = {};
  try {
    const result = await elk.layout(graph);
    for (const child of result.children ?? []) {
      positions[child.id] = {
        x: typeof child.x === 'number' ? child.x : 0,
        y: typeof child.y === 'number' ? child.y : 0,
      };
    }
  } catch {
    // elk 失败时退回环形布局，保证画布不空白
    return ringLayout(nodes, edges);
  }
  return positions;
}

/** 力导向的确定性降级：按层级做同心环，不引额外依赖 */
export function ringLayout(nodes: GraphNode[], edges: Edge[]): Record<string, XY> {
  const depth = computeDepth(nodes, edges);
  const byDepth = new Map<number, string[]>();
  for (const node of nodes) {
    const level = depth.get(node.id) ?? 0;
    const list = byDepth.get(level) ?? [];
    list.push(node.id);
    byDepth.set(level, list);
  }

  const positions: Record<string, XY> = {};
  const centerX = 760;
  const centerY = 420;
  const levels = [...byDepth.keys()].sort((a, b) => a - b);
  for (const level of levels) {
    const ids = (byDepth.get(level) ?? []).sort();
    const radius = level === 0 ? 0 : 150 + level * 150;
    ids.forEach((id, index) => {
      if (radius === 0) {
        // 根层沿水平线排开，避免全部叠在圆心
        positions[id] = { x: centerX + index * (NODE_W + GAP_X) - ((ids.length - 1) * (NODE_W + GAP_X)) / 2, y: 40 };
        return;
      }
      const angle = (Math.PI * 2 * index) / ids.length - Math.PI / 2;
      positions[id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.72,
      };
    });
  }
  return positions;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function collides(x: number, y: number, positions: Record<string, XY>): boolean {
  for (const pos of Object.values(positions)) {
    if (
      Math.abs(pos.x - x) < NODE_W + GAP_X &&
      Math.abs(pos.y - y) < NODE_H + GAP_Y / 3
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 新节点补位：同层 y 取中位数，x 从该层最右往右排，碰撞就继续右移。
 * 已有节点坐标一律不动。
 */
export function placeMissing(
  nodes: GraphNode[],
  edges: Edge[],
  savedPositions: Record<string, XY>,
  missingIds: string[],
): Record<string, XY> {
  const positions: Record<string, XY> = { ...savedPositions };
  if (missingIds.length === 0) return positions;

  const depth = computeDepth(nodes, edges);
  const sorted = [...missingIds].sort((a, b) => {
    const da = depth.get(a) ?? 0;
    const db = depth.get(b) ?? 0;
    return da === db ? a.localeCompare(b) : da - db;
  });

  for (const id of sorted) {
    const level = depth.get(id) ?? 0;
    const sameLevel = nodes
      .filter((node) => node.id !== id && positions[node.id] && (depth.get(node.id) ?? 0) === level)
      .map((node) => positions[node.id]);

    const y =
      sameLevel.length > 0
        ? median(sameLevel.map((pos) => pos.y))
        : level * (NODE_H + GAP_Y);
    let x =
      sameLevel.length > 0
        ? Math.max(...sameLevel.map((pos) => pos.x)) + NODE_W + GAP_X
        : 0;

    let guard = 0;
    while (collides(x, y, positions) && guard < 500) {
      x += NODE_W + GAP_X;
      guard += 1;
    }
    positions[id] = { x, y };
  }
  return positions;
}

/**
 * 规划坐标：
 * - 完全没有存档 → 全量布局，saveAll=true；
 * - 有存档 → 存档优先，只给缺失节点补位，saveAll=有缺失。
 */
export async function planPositions(
  nodes: GraphNode[],
  edges: Edge[],
  saved: GraphPosition[],
  mode: LayoutMode = 'layered',
): Promise<PlanResult> {
  const savedMap: Record<string, XY> = {};
  for (const position of saved) {
    savedMap[position.nodeId] = { x: position.x, y: position.y };
  }

  const hasAnySaved = Object.keys(savedMap).length > 0;
  if (!hasAnySaved) {
    const positions =
      mode === 'layered' ? await layeredLayout(nodes, edges) : ringLayout(nodes, edges);
    return { positions, saveAll: nodes.length > 0, missing: nodes.map((node) => node.id) };
  }

  const missing = nodes.filter((node) => !savedMap[node.id]).map((node) => node.id);
  return { positions: placeMissing(nodes, edges, savedMap, missing), saveAll: missing.length > 0, missing };
}

/** 主动重排（切换布局算法 / 用户点重排）：忽略存档，全量覆盖 */
export async function relayout(
  nodes: GraphNode[],
  edges: Edge[],
  mode: LayoutMode,
): Promise<Record<string, XY>> {
  return mode === 'layered' ? layeredLayout(nodes, edges) : ringLayout(nodes, edges);
}
