/**
 * 建议中心（阶段 6.1）：建议列表 / 下一步提示词 / 模块速查。
 *
 * 规则与模块都只读本地快照与内置 skill/index.json；
 * 不发任何请求，payload 只是可复制文本。
 */

import { useCallback, useMemo, useState } from 'react';

import type { PageKey } from '../../../shared/constants';
import type { ProjectData } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { useToast } from '../../components/Toast';
import { buildCopilotContext } from '../../copilot/context';
import { buildCopilotPrompt } from '../../copilot/prompt';
import { RULE_WORK, rankSuggestions } from '../../copilot/rules';
import type { CopilotRule } from '../../copilot/rules';
import { resolveAssetModules } from '../../copilot/modules';

export interface CopilotPageProps {
  projectId: string;
  data: ProjectData | null;
  loading: boolean;
  onNavigate: (page: PageKey) => void;
}

const GROUP_META = {
  A: { label: 'A', title: '流程节奏', badge: 'hx-badge-green' },
  B: { label: 'B', title: '资产级', badge: 'hx-badge-blue' },
  C: { label: 'C', title: '接口级', badge: 'hx-badge-orange' },
  D: { label: 'D', title: '报告合规', badge: 'hx-badge-amber' },
  E: { label: 'E', title: '查询方向', badge: 'hx-badge-cyan' },
  F: { label: 'F', title: '测试分工', badge: 'hx-badge-violet' },
} as const;

type GroupFilter = 'all' | CopilotRule['group'];
type WorkFilter = 'all' | 'ai' | 'manual' | 'hybrid';

const WORK_LABEL: Record<WorkFilter, string> = {
  all: '全部分工',
  ai: 'AI',
  manual: '人工',
  hybrid: '混合',
};

export function CopilotPage({
  projectId,
  data,
  loading,
  onNavigate,
}: CopilotPageProps): JSX.Element {
  const toast = useToast();
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all');

  const ctx = useMemo(() => (data ? buildCopilotContext(data) : null), [data]);
  const suggestions = useMemo(() => (ctx ? rankSuggestions(ctx) : []), [ctx]);
  const modules = useMemo(() => (data ? resolveAssetModules(data.assets) : []), [data]);

  const filtered = useMemo(() => {
    return suggestions.filter((rule) => {
      if (groupFilter !== 'all' && rule.group !== groupFilter) return false;
      if (workFilter !== 'all' && (RULE_WORK[rule.id] ?? 'hybrid') !== workFilter) return false;
      return true;
    });
  }, [groupFilter, suggestions, workFilter]);

  const untested = ctx ? Math.max(0, ctx.totalCells - ctx.doneCells) : 0;

  const prompt = useMemo(
    () => (ctx ? buildCopilotPrompt(ctx, suggestions.length) : ''),
    [ctx, suggestions.length],
  );

  const copyText = useCallback(
    async (text: string, label: string): Promise<void> => {
      try {
        await navigator.clipboard.writeText(text);
        toast('success', `${label}已复制`);
      } catch {
        toast('error', '复制失败，请手动选择文本');
      }
    },
    [toast],
  );

  if (!ctx || !data) {
    return (
      <div className="hx-content-inner">
        <div className="hx-empty">
          <Icon name="spinner" size={20} className={loading ? 'hx-spin' : ''} />
          <div>{loading ? '正在读取项目数据…' : '项目数据还没加载出来，刷新页面试试'}</div>
        </div>
      </div>
    );
  }

  const workLabel = (rule: CopilotRule): string => {
    const mode = RULE_WORK[rule.id] ?? 'hybrid';
    return mode === 'ai' ? 'AI' : mode === 'manual' ? '人工' : '混合';
  };

  return (
    <div className="hx-content-inner">
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">建议中心</h1>
          <div className="hx-crumb">项目 {projectId}</div>
        </div>
        <div className="hx-spacer" />
      </div>

      <div className="hx-stat-row">
        <div className="hx-stat">
          <div className="hx-stat-label">资产</div>
          <div className="hx-stat-value">{ctx.assets.length}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">接口</div>
          <div className="hx-stat-value">{ctx.endpoints.length}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">未测格</div>
          <div className="hx-stat-value">{untested}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">命中建议</div>
          <div className="hx-stat-value">{suggestions.length}</div>
        </div>
      </div>

      <div className="hx-filter-bar">
        <span className="hx-hint">组</span>
        <button
          type="button"
          className={`hx-btn hx-btn-sm${groupFilter === 'all' ? ' hx-btn-primary' : ''}`}
          onClick={() => setGroupFilter('all')}
        >
          全部
        </button>
        {(Object.keys(GROUP_META) as CopilotRule['group'][]).map((group) => (
          <button
            key={group}
            type="button"
            className={`hx-btn hx-btn-sm${groupFilter === group ? ' hx-btn-primary' : ''}`}
            onClick={() => setGroupFilter(group)}
          >
            {group} · {GROUP_META[group].title}
          </button>
        ))}
        <span className="hx-spacer" />
        <span className="hx-hint">分工</span>
        <select
          className="hx-select"
          style={{ width: 130 }}
          value={workFilter}
          onChange={(event) => setWorkFilter(event.target.value as WorkFilter)}
          aria-label="按分工筛选建议"
        >
          {(Object.keys(WORK_LABEL) as WorkFilter[]).map((mode) => (
            <option key={mode} value={mode}>
              {WORK_LABEL[mode]}
            </option>
          ))}
        </select>
      </div>

      <section className="hx-copilot-section">
        <h2 className="hx-card-title">
          <Icon name="spark" size={14} />
          建议列表
          <span className="hx-card-title-hint">
            当前 {filtered.length} / {suggestions.length} 条
          </span>
        </h2>

        {filtered.length === 0 ? (
          <div className="hx-empty" style={{ margin: 8 }}>
            <div>当前筛选下没有命中的建议</div>
            <div className="hx-hint">换一个组 / 分工，或先把资产、接口与测试记录补起来。</div>
          </div>
        ) : (
          <div className="hx-suggestion-list">
            {filtered.map((rule) => (
              <article className="hx-suggestion-card" key={rule.id}>
                <div className="hx-suggestion-head">
                  <span className={`hx-badge ${GROUP_META[rule.group].badge}`}>
                    {rule.group} · {GROUP_META[rule.group].title}
                  </span>
                  <span className="hx-badge hx-badge-dim">P{rule.priority}</span>
                  <span className="hx-badge">{workLabel(rule)}</span>
                  <span className="hx-mono hx-hint" style={{ marginLeft: 'auto' }}>
                    {rule.id}
                  </span>
                </div>
                <h3 className="hx-suggestion-title">{rule.title}</h3>
                <div className="hx-suggestion-basis hx-mono">{rule.basis}</div>
                <div className="hx-suggestion-action">{rule.action}</div>
                {rule.payload ? (
                  <pre className="hx-suggestion-payload">{rule.payload}</pre>
                ) : null}
                <div className="hx-row" style={{ gap: 6, marginTop: 8 }}>
                  {rule.jumpTo ? (
                    <button
                      type="button"
                      className="hx-btn hx-btn-sm hx-btn-primary"
                      onClick={() => onNavigate(rule.jumpTo as PageKey)}
                    >
                      去处理
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="hx-btn hx-btn-sm"
                    onClick={() =>
                      void copyText(
                        `${rule.action}${rule.payload ? `\n\n${rule.payload}` : ''}`,
                        `建议 ${rule.id}`,
                      )
                    }
                  >
                    复制
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="hx-copilot-section">
        <div className="hx-row">
          <h2 className="hx-card-title" style={{ margin: 0 }}>
            <Icon name="spark" size={14} />
            生成下一步提示词
          </h2>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn hx-btn-sm" onClick={() => void copyText(prompt, '提示词')}>
            复制提示词
          </button>
        </div>
        <textarea className="hx-textarea hx-mono hx-prompt-box" readOnly value={prompt} />
      </section>

      <section className="hx-copilot-section">
        <h2 className="hx-card-title">
          <Icon name="folder" size={14} />
          模块速查
          <span className="hx-card-title-hint">
            按资产指纹解析 · 相对 skill/ 路径
          </span>
        </h2>
        {modules.length === 0 ? (
          <div className="hx-hint" style={{ padding: 8 }}>
            当前资产指纹还没有匹配到内置知识库模块；先补技术栈，或直接看建议列表。
          </div>
        ) : (
          <div className="hx-table-wrap">
            <table className="hx-table hx-table-dense hx-copilot-table">
              <thead>
                <tr>
                  <th>资产</th>
                  <th>模块</th>
                  <th>相对路径</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((row) => (
                  <tr key={`${row.assetId}-${row.path}`}>
                    <td>{row.assetName}</td>
                    <td>{row.title}</td>
                    <td className="hx-mono" style={{ fontSize: 11 }}>
                      {row.path}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="hx-btn hx-btn-sm"
                        onClick={() => void copyText(row.path, '模块路径')}
                      >
                        复制路径
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
