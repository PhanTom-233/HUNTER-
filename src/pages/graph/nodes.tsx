/**
 * 图谱卡片节点（190×56）+ nodeTypes。
 *
 * 视觉严格照 3.12.6 / reference/graph-demo：190×56 卡片、圆角 5、左侧 2px 类型色条、
 * 标题 12px、副标题 10px、状态点（未覆盖 / 已覆盖 / 有洞）与选中态发光（全站唯一允许的发光）。
 * 具体颜色统一由主题 CSS 变量提供，暗/亮主题切换即时生效。
 */

import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';

import type { GraphNodeKind } from '../../../shared/types';
import type { GraphNode } from './buildNodes';

const COLORS: Record<GraphNodeKind, string> = {
  root: 'var(--blue)',
  domain: 'var(--blue)',
  host: 'var(--amber)',
  site: 'var(--cyan)',
  mw: 'var(--amber)',
  feature: 'var(--cyan)',
  api: 'var(--violet)',
  vuln: 'var(--red)',
};

const KIND_LABEL: Record<GraphNodeKind, string> = {
  root: '根域',
  domain: '子域',
  host: '主机',
  site: '站点',
  mw: '中间件',
  feature: '功能点',
  api: '接口',
  vuln: '漏洞',
};

function GlobeIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="8" cy="8" r="6" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6" />
      <path d="M2 8h12" />
    </svg>
  );
}

function ServerIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="3" y="2" width="10" height="5" rx="1" />
      <rect x="3" y="9" width="10" height="5" rx="1" />
      <circle cx="5.4" cy="4.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="5.4" cy="11.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PageIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <path d="M3 5.5h10" />
      <path d="M5.5 8.5h5M5.5 11h3" />
    </svg>
  );
}

function CodeIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4 2.5 8 6 12" />
      <path d="M10 4l3.5 4L10 12" />
    </svg>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 2v1.6M8 12.4V14M2 8h1.6M12.4 8H14M3.8 3.8l1.2 1.2M11 11l1.2 1.2M12.2 3.8 11 5M5 11l-1.2 1.2" />
    </svg>
  );
}

function WarnIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    >
      <path d="M8 2.5 14 13H2z" />
      <path d="M8 6.5v3" />
      <circle cx="8" cy="11.3" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BlockIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <path d="M3 7h10M7 3v10" />
    </svg>
  );
}

const ICONS: Record<GraphNodeKind, () => JSX.Element> = {
  root: GlobeIcon,
  domain: GlobeIcon,
  host: ServerIcon,
  site: PageIcon,
  mw: GearIcon,
  feature: BlockIcon,
  api: CodeIcon,
  vuln: WarnIcon,
};

export function AssetNode({ data, selected }: NodeProps<GraphNode>): JSX.Element {
  const color = COLORS[data.kind] ?? COLORS.site;
  const Icon = ICONS[data.kind] ?? ICONS.site;
  const statusClass = data.hole ? 'hole' : data.covered ? 'cov' : '';

  return (
    <div
      className={`hx-graph-node${selected ? ' sel' : ''}`}
      style={{ ['--node-color' as string]: color } as CSSProperties}
      title={`${KIND_LABEL[data.kind] ?? '节点'} · ${data.title}`}
    >
      <span className="hx-graph-node-ico">
        <Icon />
      </span>
      <span className="hx-graph-node-txt">
        <span className="hx-graph-node-title">{data.title}</span>
        <span className="hx-graph-node-sub">{data.sub}</span>
      </span>
      <span className={`hx-graph-node-dot ${statusClass}`} />
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
    </div>
  );
}

export const nodeTypes = { asset: AssetNode };

export { KIND_LABEL, COLORS };
