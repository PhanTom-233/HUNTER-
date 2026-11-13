/**
 * 有项目时的项目壳（总览页）。本轮只做骨架：指标卡 + 项目信息 + 交付清单。
 */

import { BUNDLED_SKILL_LABEL, MODE_META, PROJECT_STATUS_LABEL } from '../../shared/constants';
import type { PageKey } from '../../shared/constants';
import type { ProjectData } from '../../shared/types';
import { Icon } from '../components/Icons';
import { buildCopilotContext } from '../copilot/context';
import { rankSuggestions } from '../copilot/rules';
import { formatDateTime } from '../lib/format';

export interface DashboardPageProps {
  data: ProjectData | null;
  loading: boolean;
  onNavigate: (page: PageKey) => void;
}

interface Metric {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
}

const DELIVERED_PAGES: { name: string; ability: string }[] = [
  { name: '总览', ability: '项目进度、下一步建议 TOP3、空转预警、最近活动' },
  { name: '资产库', ability: '资产 CRUD、16 栏技术栈、历史漏洞与攻击面' },
  { name: '接口清单', ability: '八态可访问性、差分面、path / curl / Swagger 导入' },
  { name: '测试矩阵', ability: '四态记录、分工徽章、批量 N-A、覆盖统计' },
  { name: '资产图谱', ability: '自动拓扑、手动画边、路径高亮与坐标持久化' },
  { name: '建议中心', ability: 'B/C/D/F + A/E 规则、下一步提示词、模块速查' },
  { name: '漏洞报告', ability: 'docx 创建 / 打开 / 删除，正文不存 JSON' },
  { name: '设置', ability: '主题、单项目 JSON 导入导出、手动备份' },
  { name: '种子队列', ability: 'doing 唯一、一种子闭环、破闸日志、P2 活筛提示' },
  { name: '工作流', ability: '8 段阶段条、跳步警示、卡点清单' },
  { name: 'AI 读这里', ability: '机器可读的 API 结构，供 AI 自动填表（GET /api/ai-schema）' },
];

export function DashboardPage({ data, loading, onNavigate }: DashboardPageProps): JSX.Element {
  if (!data) {
    return (
      <div className="hx-content-inner">
        <div className="hx-empty">
          <Icon name="spinner" size={20} className="hx-spin" />
          <div>{loading ? '正在读取项目数据…' : '项目数据还没加载出来，刷新页面试试'}</div>
        </div>
      </div>
    );
  }

  const { project } = data;
  const topSuggestions = rankSuggestions(buildCopilotContext(data)).slice(0, 3);
  const seedDone = data.seeds.filter((seed) => seed.status === 'done').length;
  const assetCovered = data.assets.filter((asset) => asset.covered).length;
  const reportCount = data.reports.length;

  const metrics: Metric[] = [
    {
      label: '种子',
      value: `${seedDone}`,
      suffix: `/ ${data.seeds.length}`,
      hint: project.mode === 'lock' ? '锁面模式不启用种子队列' : 'done / total',
    },
    {
      label: '资产',
      value: `${assetCovered}`,
      suffix: `/ ${data.assets.length}`,
      hint: 'covered / total',
    },
    {
      label: '接口',
      value: `${data.endpoints.length}`,
      suffix: '',
      hint: '已建清单条目数',
    },
    {
      label: '报告',
      value: `${reportCount}`,
      suffix: '',
      hint: '严重 / 高危 / 中危',
    },
  ];

  return (
    <div className="hx-content-inner">
      <div className="hx-row" style={{ marginBottom: 4 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            color: 'var(--strong)',
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          {project.name}
        </h1>
        <span
          className={`hx-badge ${project.mode === 'lock' ? 'hx-badge-lock' : 'hx-badge-free'}`}
          title={MODE_META[project.mode].desc}
        >
          <Icon name={project.mode === 'lock' ? 'lock' : 'free'} size={11} />
          {MODE_META[project.mode].label}
        </span>
        <span className="hx-badge">{PROJECT_STATUS_LABEL[project.status]}</span>
      </div>
      <div className="hx-crumb" style={{ marginBottom: 18 }}>
        {project.id} · 更新于 {formatDateTime(project.updatedAt)}
      </div>

      <div className="hx-card" style={{ marginBottom: 16 }}>
        <h2 className="hx-card-title">
          <Icon name="spark" size={14} />
          下一步建议 TOP 3
          <span className="hx-spacer" />
          <button type="button" className="hx-btn hx-btn-sm" onClick={() => onNavigate('copilot')}>
            打开建议中心
          </button>
        </h2>
        {topSuggestions.length === 0 ? (
          <div className="hx-hint" style={{ padding: 8 }}>
            当前没有命中建议；先补资产、接口与测试记录。
          </div>
        ) : (
          <div className="hx-suggestion-mini-list">
            {topSuggestions.map((rule) => (
              <button
                key={rule.id}
                type="button"
                className="hx-suggestion-mini"
                onClick={() => onNavigate('copilot')}
              >
                <span className="hx-badge hx-badge-dim">P{rule.priority}</span>
                <span className="hx-badge">{rule.group}</span>
                <span className="hx-suggestion-mini-title">{rule.title}</span>
                <span className="hx-hint hx-mono">{rule.basis}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hx-metrics" style={{ marginBottom: 16 }}>
        {metrics.map((metric) => (
          <div key={metric.label} className="hx-metric">
            <div className="hx-metric-label">{metric.label}</div>
            <div className="hx-metric-value">
              {metric.value}
              {metric.suffix ? <em> {metric.suffix}</em> : null}
            </div>
            <div className="hx-hint" style={{ marginTop: 8, fontSize: 11 }}>
              {metric.hint}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 12 }}>
        <div className="hx-card">
          <h2 className="hx-card-title">
            <Icon name="folder" size={14} />
            项目信息
            <span className="hx-card-title-hint">data/{project.id}.json</span>
          </h2>
          <dl className="hx-kv">
            <dt>目标名称</dt>
            <dd>{project.targetName}</dd>

            <dt>模式</dt>
            <dd>
              {MODE_META[project.mode].label}
              <span style={{ color: 'var(--dim)' }}> · {MODE_META[project.mode].short}</span>
            </dd>

            <dt>授权范围</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>
              {project.scopeNote ? project.scopeNote : <span style={{ color: 'var(--dim)' }}>未填写</span>}
            </dd>

            <dt>SRC 地址</dt>
            <dd>
              {project.srcUrl ? (
                <span className="hx-mono" style={{ fontSize: 11 }}>
                  {project.srcUrl}
                </span>
              ) : (
                <span style={{ color: 'var(--dim)' }}>未填写</span>
              )}
            </dd>

            <dt>方法论包</dt>
            <dd className="hx-mono" style={{ fontSize: 11 }}>
              {BUNDLED_SKILL_LABEL}
            </dd>

            <dt>创建时间</dt>
            <dd className="hx-mono" style={{ fontSize: 11 }}>
              {formatDateTime(project.createdAt)}
            </dd>
          </dl>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="hx-card">
            <h2 className="hx-card-title">
              <Icon name="check" size={14} />
              本轮已交付
              <span className="hx-card-title-hint">11 / 11</span>
            </h2>
            {DELIVERED_PAGES.map((page) => (
              <div className="hx-check" key={page.name}>
                <span className="hx-check-mark">
                  <Icon name="check" size={13} />
                </span>
                <span>
                  {page.name}：{page.ability}
                </span>
              </div>
            ))}
          </div>

          <div className="hx-card">
            <h2 className="hx-card-title">
              <Icon name="arrowRight" size={14} />
              接下来
            </h2>
            <div className="hx-check">
              <span className="hx-check-mark" style={{ color: 'var(--dim)' }}>
                <Icon name="arrowRight" size={13} />
              </span>
              <span>后续可选 · 全局搜索 / 项目间对比 / 图谱簇折叠</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hx-card-flat" style={{ marginTop: 12 }}>
        <div className="hx-row">
          <Icon name="spark" size={14} />
          <span style={{ color: 'var(--strong)', fontSize: 13 }}>现在能做什么</span>
          <div className="hx-spacer" />
          <span className="hx-hint">
            10 个页面全部交付：从项目、资产、接口、矩阵、图谱到建议、报告、设置、种子与工作流。
          </span>
        </div>
        <div className="hx-hint" style={{ marginTop: 8 }}>
          想验证数据真的存住了：新建一个项目 → 完全关掉后端（Ctrl+C）→ 再
          <span className="hx-code"> npm run dev </span>
          → 刷新页面，项目还在；同时 <span className="hx-code">data/</span> 下会多出
          <span className="hx-code"> {project.id}.json </span>和
          <span className="hx-code"> data/backup/</span> 里的备份。
        </div>
      </div>
    </div>
  );
}
