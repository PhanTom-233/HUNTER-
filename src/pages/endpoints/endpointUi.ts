/** 接口清单页的展示映射（八态徽章 / 回包特征判断 / 测试覆盖）。 */

import type { AccessState, Endpoint, RespSignature, TestRecord } from '../../../shared/types';

/** PHASE-4 定死的八态配色，不做成布尔 */
export const ACCESS_BADGE: Record<AccessState, string> = {
  '匿名可访问-有业务字段': 'hx-badge-red',
  '匿名可访问-无业务字段': 'hx-badge-orange',
  需登录: 'hx-badge-blue',
  '401': 'hx-badge-blue',
  '403': 'hx-badge-amber',
  '404': 'hx-badge-dim',
  超时: 'hx-badge-dim',
  未测试: 'hx-badge-white',
};

export interface RespHint {
  text: string;
  tone: 'samegate' | 'diff' | 'normal';
  /** 该回包特征下 diffSurface 应被强制成的值；null 表示不强制 */
  forcedDiff: boolean | null;
}

export const RESP_HINT: Record<RespSignature, RespHint> = {
  仅登录码: {
    text: '同闸 · 四件套整段 N/A（原因：回码仅为登录闸）→ 转认证口',
    tone: 'samegate',
    forcedDiff: false,
  },
  空列表: {
    text: '有差分面，必须测，不是请登录（换参 / 换 id / 按栈选探针）',
    tone: 'diff',
    forcedDiff: true,
  },
  报错500: {
    text: '有差分面，必须测，不是请登录（按报错栈选探针）',
    tone: 'diff',
    forcedDiff: true,
  },
  超时: {
    text: '有差分面，必须测，不是请登录（超时也是差分信号）',
    tone: 'diff',
    forcedDiff: true,
  },
  有业务JSON: {
    text: '常规业务回包：按参数差分面逐项测',
    tone: 'normal',
    forcedDiff: null,
  },
  静态HTML: {
    text: '静态 / 未见业务字段：探活后再判断',
    tone: 'normal',
    forcedDiff: null,
  },
};

/** 回包特征对应的 diffSurface 强制值；null = 由用户勾选 */
export function forcedDiffSurface(sig: RespSignature): boolean | null {
  return RESP_HINT[sig].forcedDiff;
}

export function methodClass(method: Endpoint['method']): string {
  switch (method) {
    case 'GET':
      return 'hx-badge-blue';
    case 'POST':
      return 'hx-badge-amber';
    case 'DELETE':
      return 'hx-badge-red';
    case 'PUT':
    case 'PATCH':
      return 'hx-badge-violet';
    default:
      return 'hx-badge-dim';
  }
}

/** 测试覆盖列：按该接口关联的测试记录算，不依赖测试矩阵页面 */
export function coverageOf(tests: TestRecord[], endpointId: string): {
  label: string;
  title: string;
  done: number;
  total: number;
} {
  const rows = tests.filter((item) => item.endpointId === endpointId);
  if (rows.length === 0) {
    return { label: '未测', title: '暂无测试记录（阶段 5 测试矩阵会写入）', done: 0, total: 0 };
  }
  const done = rows.filter((item) => item.state === '打穿' || item.state === '证伪').length;
  const na = rows.filter((item) => item.state === 'N-A').length;
  return {
    label: `${done} / ${rows.length}`,
    title: `共 ${rows.length} 条测试记录 · 已结论 ${done} 条 · N/A ${na} 条`,
    done,
    total: rows.length,
  };
}

export function paramSummary(endpoint: Endpoint): string {
  if (endpoint.params.length === 0) return '—';
  const byLocation = endpoint.params.reduce<Record<string, number>>((acc, item) => {
    acc[item.in] = (acc[item.in] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(byLocation)
    .map(([location, count]) => `${location}:${count}`)
    .join(' ');
}
