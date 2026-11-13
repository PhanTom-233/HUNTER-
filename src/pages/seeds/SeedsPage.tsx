/**
 * 种子队列：doing 唯一 / 破闸日志 / P2 活筛提示。
 *
 * 所有门禁以后端为准；本页只做展示与错误详情展开。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  SEED_ALIVE_FILTERS,
  SEED_SOURCES,
  SEED_STATUSES,
  SEED_TYPES,
} from '../../../shared/constants';
import type {
  ProjectData,
  Seed,
  SeedAliveFilter,
  SeedListPayload,
  SeedPriority,
  SeedSource,
  SeedStatus,
} from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ApiError, api, toErrorText } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export interface SeedsPageProps {
  projectId: string;
  data: ProjectData | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (page: 'assets' | 'seeds') => void;
}

interface SeedForm {
  keyword: string;
  type: SeedPriority;
  source: SeedSource;
  aliveFilter: SeedAliveFilter;
  poolSize: string;
  parentHost: string;
  note: string;
}

interface GateBusyDetails {
  message: string;
  doingSeedId: string;
  assets: { id: string; name: string }[];
}

const STATUS_META: Record<SeedStatus, { label: string; badge: string }> = {
  pending: { label: '待处理', badge: 'hx-badge-dim' },
  doing: { label: '进行中', badge: 'hx-badge-green' },
  done: { label: '完成', badge: 'hx-badge-blue' },
  cold: { label: '冷置', badge: 'hx-badge-amber' },
};

const TYPE_META: Record<SeedPriority, string> = {
  P0: 'hx-badge-violet',
  P1: 'hx-badge-blue',
  P2: 'hx-badge-dim',
};

function emptyForm(): SeedForm {
  return {
    keyword: '',
    type: 'P1',
    source: '用户原词',
    aliveFilter: '未筛',
    poolSize: '0',
    parentHost: '',
    note: '',
  };
}

function formFrom(seed: Seed): SeedForm {
  return {
    keyword: seed.keyword,
    type: seed.type,
    source: seed.source,
    aliveFilter: seed.aliveFilter,
    poolSize: String(seed.poolSize),
    parentHost: seed.parentHost ?? '',
    note: seed.note,
  };
}

function gateDetails(error: unknown): GateBusyDetails | null {
  if (!(error instanceof ApiError) || error.code !== 'SEED_GATE_BUSY') return null;
  const details = error.details;
  if (typeof details !== 'object' || details === null) return null;
  const record = details as Record<string, unknown>;
  const assets = Array.isArray(record.unfinishedAssets)
    ? record.unfinishedAssets
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          name: typeof item.name === 'string' ? item.name : '未命名资产',
        }))
    : [];
  return {
    message: error.message,
    doingSeedId: typeof record.doingSeedId === 'string' ? record.doingSeedId : '',
    assets,
  };
}

export function SeedsPage({
  projectId,
  data,
  loading,
  onRefresh,
  onNavigate,
}: SeedsPageProps): JSX.Element {
  const toast = useToast();
  const [payload, setPayload] = useState<SeedListPayload | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<SeedPriority | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SeedStatus | 'all'>('all');
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; seed: Seed | null } | null>(null);
  const [form, setForm] = useState<SeedForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Seed | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [gateBusy, setGateBusy] = useState<GateBusyDetails | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setListLoading(true);
    try {
      setPayload(await api.listSeeds(projectId));
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setListLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = data?.project.mode === 'lock';
  const items = useMemo(() => {
    const rows = payload?.items ?? [];
    return rows.filter((seed) => {
      if (typeFilter !== 'all' && seed.type !== typeFilter) return false;
      if (statusFilter !== 'all' && seed.status !== statusFilter) return false;
      return true;
    });
  }, [payload, statusFilter, typeFilter]);

  const seedName = useCallback(
    (id: string | null): string => {
      if (!id) return '—';
      return data?.seeds.find((seed) => seed.id === id)?.keyword ?? id;
    },
    [data],
  );

  const setField = <K extends keyof SeedForm>(key: K, value: SeedForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openCreate = (): void => {
    setForm(emptyForm());
    setEditor({ mode: 'create', seed: null });
  };

  const openEdit = (seed: Seed): void => {
    setForm(formFrom(seed));
    setEditor({ mode: 'edit', seed });
  };

  const handleFailure = (error: unknown): void => {
    const busy = gateDetails(error);
    if (busy) {
      setGateBusy(busy);
      toast('error', busy.message);
      return;
    }
    toast('error', toErrorText(error));
  };

  const save = async (): Promise<void> => {
    if (!editor) return;
    if (!form.keyword.trim()) {
      toast('error', '种子关键词不能为空');
      return;
    }
    const poolSize = Number(form.poolSize);
    if (!Number.isInteger(poolSize) || poolSize < 0) {
      toast('error', '池大小必须是非负整数');
      return;
    }
    setSaving(true);
    try {
      const input = {
        keyword: form.keyword.trim(),
        type: form.type,
        source: form.source,
        aliveFilter: form.aliveFilter,
        poolSize,
        parentHost: form.parentHost.trim() || null,
        note: form.note,
      };
      if (editor.mode === 'create') {
        await api.createSeed(projectId, { ...input, status: 'pending' });
        toast('success', '种子已新增');
      } else if (editor.seed) {
        await api.updateSeed(projectId, editor.seed.id, input);
        toast('success', '种子已更新');
      }
      setEditor(null);
      await load();
      await onRefresh();
    } catch (error) {
      handleFailure(error);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (seed: Seed, status: SeedStatus): Promise<void> => {
    try {
      await api.setSeedStatus(projectId, seed.id, status);
      toast('success', `种子「${seed.keyword}」已标记为 ${STATUS_META[status].label}`);
      await load();
      await onRefresh();
    } catch (error) {
      handleFailure(error);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteSeed(projectId, pendingDelete.id);
      toast('success', `种子「${pendingDelete.keyword}」已删除；关联资产只置空 seedId`);
      setPendingDelete(null);
      await load();
      await onRefresh();
    } catch (error) {
      handleFailure(error);
    } finally {
      setDeleting(false);
    }
  };

  if (!data) {
    return (
      <div className="hx-content-inner">
        <div className="hx-empty">
          <Icon name="spinner" size={20} className={loading ? 'hx-spin' : ''} />
          <div>{loading ? '正在读取种子队列…' : '项目数据还没加载出来，刷新页面试试'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="hx-content-inner">
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">种子队列</h1>
          <div className="hx-crumb">
            项目 {projectId} · 一种子闭环 · 当前 doing：{payload?.doing?.keyword ?? '未设置'} · 剩余{' '}
            {payload?.unfinishedAssets.length ?? 0} 个活面
          </div>
        </div>
        <div className="hx-spacer" />
        <button type="button" className="hx-btn" onClick={() => onNavigate('assets')}>
          去资产库
        </button>
        <button
          type="button"
          className="hx-btn hx-btn-primary"
          onClick={openCreate}
          disabled={locked}
        >
          <Icon name="plus" size={13} />
          新增种子
        </button>
      </div>

      {locked ? (
        <div className="hx-matrix-notice">
          锁面不主动出圈；本页记录能力保留，但当前模式不适用。
        </div>
      ) : null}

      <div className={locked ? 'hx-page-locked' : ''}>
        <div className="hx-stat-row">
          <div className="hx-stat">
            <div className="hx-stat-label">种子总数</div>
            <div className="hx-stat-value">{data.seeds.length}</div>
          </div>
          <div className="hx-stat">
            <div className="hx-stat-label">doing</div>
            <div className="hx-stat-value">{payload?.doing ? 1 : 0}</div>
          </div>
          <div className="hx-stat">
            <div className="hx-stat-label">未完成活面</div>
            <div className="hx-stat-value">{payload?.unfinishedAssets.length ?? 0}</div>
          </div>
          <div className="hx-stat">
            <div className="hx-stat-label">破闸次数</div>
            <div className="hx-stat-value">{payload?.breakLogs.length ?? 0}</div>
          </div>
        </div>

        <div className="hx-filter-bar">
          <select
            className="hx-select"
            style={{ width: 150 }}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as SeedPriority | 'all')}
            aria-label="按类型筛选种子"
          >
            <option value="all">全部类型</option>
            {SEED_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            className="hx-select"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SeedStatus | 'all')}
            aria-label="按状态筛选种子"
          >
            <option value="all">全部状态</option>
            {SEED_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_META[status].label}</option>
            ))}
          </select>
          <span className="hx-spacer" />
          <span className="hx-hint">显示 {items.length} / {data.seeds.length} 条</span>
        </div>

        <div className="hx-card" style={{ padding: '4px 6px' }}>
          {listLoading && !payload ? (
            <div className="hx-empty" style={{ margin: 12 }}>
              <Icon name="spinner" size={18} className="hx-spin" />
              <div>正在读取种子队列…</div>
            </div>
          ) : items.length === 0 ? (
            <div className="hx-empty" style={{ margin: 12 }}>
              <Icon name="seeds" size={20} />
              <div>还没有种子</div>
              <div className="hx-hint">先新增一个业务词 / 根域 / 备案主域，再讨论扩面。</div>
            </div>
          ) : (
            <div className="hx-table-wrap">
              <table className="hx-table hx-seeds-table">
                <colgroup>
                  <col style={{ width: '24%' }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 86 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 76 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 360 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>种子</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>来源</th>
                    <th>池大小</th>
                    <th>未完成资产数</th>
                    <th style={{ textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((seed) => {
                    const unfinished = payload?.counts[seed.id] ?? 0;
                    const expandDisabled = seed.type === 'P2' && seed.aliveFilter !== '通过';
                    return (
                      <tr key={seed.id}>
                        <td>
                          <div className="hx-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--strong)' }}>{seed.keyword}</span>
                            {seed.gateBroken ? <span className="hx-badge hx-badge-red">破闸</span> : null}
                          </div>
                          <div className="hx-hint hx-cell-clip" title={seed.note}>
                            {seed.note || '—'}
                          </div>
                        </td>
                        <td><span className={`hx-badge ${TYPE_META[seed.type]}`}>{seed.type}</span></td>
                        <td><span className={`hx-badge ${STATUS_META[seed.status].badge}`}>{STATUS_META[seed.status].label}</span></td>
                        <td className="hx-hint" style={{ fontSize: 11 }}>{seed.source}</td>
                        <td className="hx-mono">{seed.poolSize}</td>
                        <td>
                          <span className={`hx-badge ${unfinished > 0 ? 'hx-badge-amber' : 'hx-badge-dim'}`}>
                            {unfinished}
                          </span>
                        </td>
                        <td>
                          <div className="hx-row" style={{ justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
                            {seed.status !== 'doing' ? (
                              <button type="button" className="hx-btn hx-btn-sm" onClick={() => void changeStatus(seed, 'doing')}>doing</button>
                            ) : null}
                            {seed.status !== 'done' ? (
                              <button type="button" className="hx-btn hx-btn-sm" onClick={() => void changeStatus(seed, 'done')}>done</button>
                            ) : null}
                            {seed.status !== 'cold' ? (
                              <button type="button" className="hx-btn hx-btn-sm" onClick={() => void changeStatus(seed, 'cold')}>cold</button>
                            ) : null}
                            <button
                              type="button"
                              className="hx-btn hx-btn-sm"
                              onClick={() => {
                                if (expandDisabled) return;
                                toast('success', '扩面动作由外部执行，本程序只记录方向，不生成查询');
                              }}
                              disabled={expandDisabled}
                              title={expandDisabled ? 'P2 必须先活筛通过' : '记录扩面方向'}
                            >
                              扩面
                            </button>
                            <button type="button" className="hx-btn hx-btn-sm" onClick={() => openEdit(seed)}>编辑</button>
                            <button type="button" className="hx-icon-btn" onClick={() => setPendingDelete(seed)} title="删除种子" aria-label={`删除 ${seed.keyword}`}>
                              <Icon name="trash" size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="hx-card" style={{ marginTop: 12 }}>
          <h2 className="hx-card-title">
            <Icon name="alert" size={14} />
            破闸日志
            <span className="hx-card-title-hint">一种子闭环硬约束</span>
          </h2>
          {(payload?.breakLogs ?? []).length === 0 ? (
            <div className="hx-hint" style={{ padding: 8 }}>暂无破闸记录。</div>
          ) : (
            <div className="hx-break-list">
              {(payload?.breakLogs ?? []).slice(0, 30).map((log) => (
                <div className="hx-break-row" key={log.id}>
                  <span className="hx-break-mark">破闸</span>
                  <span className="hx-mono hx-hint">{formatDateTime(log.at)}</span>
                  <span>doing：{seedName(log.doingSeedId)}</span>
                  <span>新种子：{seedName(log.pendingSeedId)}</span>
                  <span className="hx-hint">未完成资产 {log.unfinishedAssetIds.length} 个</span>
                  <span className="hx-hint">{log.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={editor !== null}
        title={editor?.mode === 'edit' ? '编辑种子' : '新增种子'}
        subtitle={locked ? '锁面模式不适用' : '种子只记录方向；程序不发起任何查询。'}
        onClose={() => setEditor(null)}
        maxWidth={620}
        locked={saving}
        footer={
          <>
            <button type="button" className="hx-btn" onClick={() => setEditor(null)} disabled={saving}>取消</button>
            <button type="button" className="hx-btn hx-btn-primary" onClick={() => void save()} disabled={saving || locked}>保存</button>
          </>
        }
      >
        <div className="hx-form-grid-2">
          <label className="hx-field">
            <span className="hx-label">关键词 *</span>
            <input className="hx-input" maxLength={80} value={form.keyword} onChange={(event) => setField('keyword', event.target.value)} placeholder="业务名 / 品牌 / 根域" />
          </label>
          <label className="hx-field">
            <span className="hx-label">类型 *</span>
            <select className="hx-select" value={form.type} onChange={(event) => setField('type', event.target.value as SeedPriority)}>
              {SEED_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        </div>
        <div className="hx-form-grid-2">
          <label className="hx-field">
            <span className="hx-label">来源 *</span>
            <select className="hx-select" value={form.source} onChange={(event) => setField('source', event.target.value as SeedSource)}>
              {SEED_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
          </label>
          <label className="hx-field">
            <span className="hx-label">活筛状态 *</span>
            <select className="hx-select" value={form.aliveFilter} onChange={(event) => setField('aliveFilter', event.target.value as SeedAliveFilter)}>
              {SEED_ALIVE_FILTERS.map((filter) => <option key={filter} value={filter}>{filter}</option>)}
            </select>
          </label>
        </div>
        <div className="hx-form-grid-2">
          <label className="hx-field">
            <span className="hx-label">池大小</span>
            <input className="hx-input" type="number" min={0} step={1} value={form.poolSize} onChange={(event) => setField('poolSize', event.target.value)} />
          </label>
          <label className="hx-field">
            <span className="hx-label">回灌来源 host</span>
            <input className="hx-input" maxLength={200} value={form.parentHost} onChange={(event) => setField('parentHost', event.target.value)} placeholder="可空" />
          </label>
        </div>
        <label className="hx-field">
          <span className="hx-label">备注</span>
          <textarea className="hx-textarea" style={{ minHeight: 60 }} maxLength={500} value={form.note} onChange={(event) => setField('note', event.target.value)} />
        </label>
        {form.type === 'P2' && form.aliveFilter !== '通过' ? (
          <div className="hx-hint">P2 未通过活筛时，扩面按钮会被禁用；扩面动作由外部执行。</div>
        ) : null}
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title="删除种子？"
        subtitle="不会删除资产；关联资产的 seedId 会被置空。"
        onClose={() => setPendingDelete(null)}
        maxWidth={440}
        locked={deleting}
        footer={
          <>
            <button type="button" className="hx-btn" onClick={() => setPendingDelete(null)} disabled={deleting}>取消</button>
            <button type="button" className="hx-btn hx-btn-danger" onClick={() => void confirmDelete()} disabled={deleting}>删除</button>
          </>
        }
      >
        <div className="hx-mono">{pendingDelete?.keyword ?? ''}</div>
      </Modal>

      <Modal
        open={gateBusy !== null}
        title="doing 唯一：当前种子还有活面未闭环"
        subtitle={gateBusy?.message ?? ''}
        onClose={() => setGateBusy(null)}
        maxWidth={520}
        footer={<button type="button" className="hx-btn" onClick={() => setGateBusy(null)}>知道了</button>}
      >
        <div className="hx-hint" style={{ marginBottom: 8 }}>
          先把下面这些资产覆盖 / 证伪 / 记 N-A，再切换 doing：
        </div>
        <ul className="hx-gate-list">
          {(gateBusy?.assets ?? []).map((asset) => (
            <li key={asset.id}>{asset.name}<span className="hx-mono hx-hint"> {asset.id}</span></li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
