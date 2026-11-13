/**
 * 下一步提示词：把当前项目快照拼成可粘给外部 AI 的纯文本。
 *
 * 只使用相对路径 `skill/index.json`，不出现任何本机目录或用户名。
 */

import { fpItems } from '../../shared/fpDerive';
import type { CopilotContext } from './context';

const FOUR_PIECE = ['INJ-01', 'INJ-03', 'CLI-01', 'SRV-01'];

export function buildCopilotPrompt(ctx: CopilotContext, suggestionCount: number): string {
  const untested = Math.max(0, ctx.totalCells - ctx.doneCells);
  const fourPiece = FOUR_PIECE.map(
    (id) => `${id}:${ctx.doneVulnTypes.has(id) ? '有完成态' : '空'}`,
  ).join('；');
  const fingerprintSummary =
    ctx.assets
      .map((asset) => {
        const names = fpItems(asset.fp)
          .map((item) => item.name)
          .slice(0, 8);
        return `- ${asset.name}: ${names.length > 0 ? names.join('、') : '未填'}`;
      })
      .join('\n') || '- 暂无资产';
  const modeText = ctx.project.mode === 'lock' ? '锁面' : '自由跳';

  return [
    '你是我在本地 HUNTER 里的渗透测试协作 AI。',
    '软件内置 Skill，索引在 skill/index.json。请只基于该索引和下列项目上下文给下一步动作，不要编造目标数据。',
    '',
    `项目：${ctx.project.name}（${ctx.project.id}）`,
    `模式：${modeText}`,
    `资产：${ctx.assets.length} · 接口：${ctx.endpoints.length} · 未测格：${untested} · 命中建议：${suggestionCount}`,
    `四件套：${fourPiece}`,
    '',
    '资产指纹摘要：',
    fingerprintSummary,
    '',
    '请输出：',
    '1. TOP3 下一步动作；',
    '2. 每条为什么现在做（引用 skill 内的规则/策略）；',
    '3. 只读记录，不要向目标发包，不要写目标。',
  ].join('\n');
}
