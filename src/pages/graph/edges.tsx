/**
 * 三种边的样式工厂（3.12.2）：
 * - 拓扑边：1px 主题树边色 实线带箭头，无标签；
 * - 手动边：1.5px 主题琥珀色 虚线 5 4，带类型标签，labelBg 跟随主题；
 * - 路径边：1.6px 主题青色，animated。
 *
 * 颜色统一用 CSS 变量，主题切换即时生效；禁止在页面里散落硬编码颜色值。
 */

import { MarkerType } from '@xyflow/react';
import type { Edge } from '@xyflow/react';

import type { ManualEdge } from '../../../shared/types';

export const TREE_STROKE = 'var(--graph-edge-tree)';
export const MANUAL_STROKE = 'var(--amber)';
export const PATH_STROKE = 'var(--cyan)';
export const LABEL_BG = 'var(--graph-label-bg)';

const MANUAL_LABEL_STYLE = {
  fill: MANUAL_STROKE,
  fontSize: 10,
  fontFamily: "'JetBrains Mono', Consolas, monospace",
} as const;

/** 自动拓扑边；label 只用于阶段 4 的 site/feature → api「暴露」标注 */
export function topologyEdge(
  id: string,
  source: string,
  target: string,
  label?: string,
): Edge {
  const edge: Edge = {
    id,
    source,
    target,
    sourceHandle: 'b',
    targetHandle: 't',
    type: 'default',
    style: { stroke: TREE_STROKE, strokeWidth: 1 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: TREE_STROKE,
      width: 12,
      height: 12,
    },
  };
  if (label) {
    edge.label = label;
    edge.labelStyle = {
      fill: TREE_STROKE,
      fontSize: 9,
      fontFamily: "'JetBrains Mono', Consolas, monospace",
    };
    edge.labelBgStyle = { fill: LABEL_BG, fillOpacity: 0.9 };
    edge.labelBgPadding = [3, 1];
    edge.labelBgBorderRadius = 2;
  }
  return edge;
}

/** 手动横向关联边（用户画的） */
export function manualFlowEdge(edge: ManualEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: 'r',
    targetHandle: 'l',
    type: 'default',
    style: { stroke: MANUAL_STROKE, strokeWidth: 1.5, strokeDasharray: '5 4' },
    label: edge.relation,
    labelStyle: { ...MANUAL_LABEL_STYLE },
    labelBgStyle: { fill: LABEL_BG, fillOpacity: 0.92 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 3,
    data: { manualId: edge.id, relation: edge.relation, note: edge.note },
  };
}

/** 路径高亮边（青色流动） */
export function pathFlowEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: 'b',
    targetHandle: 't',
    type: 'default',
    animated: true,
    style: { stroke: PATH_STROKE, strokeWidth: 1.6 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: PATH_STROKE,
      width: 12,
      height: 12,
    },
  };
}
