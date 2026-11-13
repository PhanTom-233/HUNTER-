/**
 * 工作流：8 段阶段条 + 卡点清单。
 *
 * 纯进度条 + 清单；所有口径从现有实体推导。
 */

import { useMemo, useState } from 'react';

import type { PageKey } from '../../../shared/constants';
import type { ProjectData } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { WORKFLOW_BASIS, buildBlockers, buildStages } from './workflowModel';

export interface WorkflowPageProps {
  projectId: string;
  data: ProjectData | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (page: PageKey) => void;
}

export function WorkflowPage({
  projectId,
  data,
  loading,
  onRefresh,
  onNavigate,
}: WorkflowPageProps): JSX.Element {
  const [selected, setSelected] = useState<number | null>(null);

  const stages = useMemo(() => (data ? buildStages(data) : []), [data]);
  const current = useMemo(() => {
    const first = stages.findIndex((stage) => stage.done < stage.total);
    return first < 0 ? Math.max(0, stages.length - 1) : first;
  }, [stages]);
  const active = selected ?? current;
  const skipped = stages.slice(0, active).filter((stage) => stage.done < stage.total).length;
  const blockers = useMemo(() => (data ? buildBlockers(data, stages) : []), [data, stages]);

  if (!data) {
    return (
      <div className="hx-content-inner">
        <div className="hx-empty">
          <Icon name="spinner" size={20} className={loading ? 'hx-spin' : ''} />
          <div>{loading ? '正在读取工作流…' : '项目数据还没加载出来，刷新页面试试'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="hx-content-inner">
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">工作流</h1>
          <div className="hx-crumb">
            项目 {projectId} · 8 段阶段条 · 当前第 {current + 1} 段
          </div>
        </div>
        <div className="hx-spacer" />
        <button type="button" className="hx-btn" onClick={() => void onRefresh()} disabled={loading}>
          刷新
        </button>
      </div>

      <div className="hx-card" style={{ padding: 10 }}>
        <div className="hx-stage-track">
          {stages.map((stage, index) => (
            <button
              key={stage.label}
              type="button"
              className={`hx-stage${index === current ? ' hx-stage-current' : ''}${
                index === active ? ' hx-stage-selected' : ''
              }`}
              onClick={() => setSelected(index)}
              title={stage.hint}
            >
              <span className="hx-stage-index">S{index + 1}</span>
              <span className="hx-stage-label">{stage.label}</span>
              <span className="hx-stage-count hx-mono">
                {stage.done} / {stage.total}
              </span>
              <span className={`hx-stage-bar ${stage.done >= stage.total ? 'done' : ''}`}>
                <span
                  style={{
                    width: `${
                      stage.total === 0
                        ? 0
                        : Math.min(100, Math.round((stage.done / stage.total) * 100))
                    }%`,
                  }}
                />
              </span>
            </button>
          ))}
        </div>
        <div className="hx-hint" style={{ marginTop: 8 }}>
          {stages[active]?.hint ?? ''}
        </div>
        {skipped > 0 ? (
          <div className="hx-skip-warning">
            <Icon name="alert" size={13} />
            已跳步：前面还有 {skipped} 段未完成
          </div>
        ) : null}
      </div>

      <div className="hx-card" style={{ marginTop: 12 }}>
        <h2 className="hx-card-title">
          <Icon name="alert" size={14} />
          卡点清单
          <span className="hx-card-title-hint">{blockers.length} 条 · 依据 {WORKFLOW_BASIS}</span>
        </h2>
        {blockers.length === 0 ? (
          <div className="hx-empty" style={{ margin: 8 }}>
            <Icon name="check" size={18} />
            <div>当前没有硬卡点；继续按矩阵推进。</div>
          </div>
        ) : (
          <div className="hx-blocker-list">
            {blockers.map((blocker) => (
              <div className="hx-blocker-row" key={blocker.title}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--strong)' }}>{blocker.title}</div>
                </div>
                <button
                  type="button"
                  className="hx-btn hx-btn-sm hx-btn-primary"
                  onClick={() => onNavigate(blocker.jumpTo)}
                >
                  去处理
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
