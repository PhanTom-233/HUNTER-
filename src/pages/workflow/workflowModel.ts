/**
 * 工作流 8 段计数与卡点清单的纯函数。
 *
 * 口径固定，页面只负责展示；后续测试可直接用本文件做手算对照。
 */

import type { PageKey } from '../../../shared/constants';
import type { ProjectData } from '../../../shared/types';

export interface Stage {
  label: string;
  done: number;
  total: number;
  hint: string;
}

export interface Blocker {
  title: string;
  jumpTo: PageKey;
}

export const MATRIX_COLUMNS = 45;
export const WORKFLOW_BASIS = 'skill/rules/dig-scope-workflow.md';

export function buildStages(data: ProjectData): Stage[] {
  const seedDone = data.seeds.filter((seed) => seed.status === 'done').length;
  const seedTotal = data.seeds.length === 0 ? 1 : data.seeds.length;
  const cleaned = data.assets.filter((asset) => asset.aliveStatus !== '未探活').length;
  const briefDone = data.assets.filter(
    (asset) =>
      Boolean(asset.brief.user.trim()) &&
      Boolean(asset.brief.objects.trim()) &&
      Boolean(asset.brief.money.trim()) &&
      Boolean(asset.brief.preAuth.trim()),
  ).length;
  const endpointsBuilt = data.assets.filter((asset) =>
    data.endpoints.some((endpoint) => endpoint.assetId === asset.id),
  ).length;
  const matrixDone = data.tests.filter((test) => test.state !== '未测').length;
  const matrixTotal = (data.endpoints.length || data.assets.length) * MATRIX_COLUMNS;

  return [
    {
      label: '定范围',
      done: data.project.scopeNote.trim() ? 1 : 0,
      total: 1,
      hint: '授权范围 / SRC 范围页写清楚，后面所有动作才有边界。',
    },
    {
      label: '种子',
      done: data.project.mode === 'lock' ? 0 : seedDone,
      total: data.project.mode === 'lock' ? 1 : seedTotal,
      hint:
        data.project.mode === 'lock'
          ? '锁面不适用'
          : '先做当前 doing 的闭环，再开下一个种子。',
    },
    {
      label: '清洗',
      done: cleaned,
      total: data.assets.length,
      hint: '停放页 / 超时 / 死链先排除，别把全量资产都算进有效面。',
    },
    {
      label: '进站说明',
      done: briefDone,
      total: data.assets.length,
      hint: '用户 / 对象 / 钱 / 前置权限四字段填全，越权与影响判断才有基准。',
    },
    {
      label: '接口清单',
      done: endpointsBuilt,
      total: data.assets.length,
      hint: '每个有效资产至少有一条接口记录；没有接口就无法进矩阵。',
    },
    {
      label: '类型矩阵',
      done: matrixDone,
      total: matrixTotal,
      hint: '按 45 个启用列记录四态；CORS 固定禁用不计。',
    },
    {
      label: '报告落盘',
      done: data.reportFiles.length > 0 ? 1 : 0,
      total: 1,
      hint: '至少创建一份 docx 报告入口，正文在 Word / WPS 里写。',
    },
    {
      label: '换站/换种',
      done: data.seeds.some((seed) => seed.status === 'done') ? 1 : 0,
      total: 1,
      hint: '一个种子闭环后再换站 / 换种，别用扩面掩盖没测完。',
    },
  ];
}

export function buildBlockers(data: ProjectData, stages: Stage[]): Blocker[] {
  const blockers: Blocker[] = [];
  const briefMissing = data.assets.filter(
    (asset) =>
      !asset.brief.user.trim() ||
      !asset.brief.objects.trim() ||
      !asset.brief.money.trim() ||
      !asset.brief.preAuth.trim(),
  ).length;
  const matrixUntested = Math.max(0, stages[5].total - stages[5].done);

  if (!data.project.scopeNote.trim()) {
    blockers.push({ title: '授权范围没写', jumpTo: 'assets' });
  }
  if (data.assets.length === 0) {
    blockers.push({ title: '还没有资产', jumpTo: 'assets' });
  }
  if (data.project.mode !== 'lock' && data.seeds.length === 0) {
    blockers.push({ title: '还没有种子', jumpTo: 'seeds' });
  }
  if (briefMissing > 0) {
    blockers.push({ title: `${briefMissing} 个资产 brief 未填`, jumpTo: 'assets' });
  }
  if (data.endpoints.length === 0) {
    blockers.push({ title: '接口清单为空', jumpTo: 'endpoints' });
  }
  if (matrixUntested > 0) {
    blockers.push({ title: `矩阵还有 ${matrixUntested} 格未测`, jumpTo: 'matrix' });
  }
  if (data.reportFiles.length === 0) {
    blockers.push({ title: '还没有报告', jumpTo: 'reports' });
  }
  return blockers;
}
