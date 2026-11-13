/**
 * 第 5 页「接口清单」（阶段 4）。
 *
 * 数据来自 App 的 ProjectData；写操作走本地 API，成功后统一 onRefresh 重新拉全量，
 * 图谱页因此会自动多出 api 节点，不需要额外 store。
 *
 * 表格固定 9 列，顺序不可变：
 * METHOD | path | 来源 | 可访问性 | 回包特征 | 差分面 | 参数数 | 测试覆盖 | 操作
 */

import { useCallback, useMemo, useState } from 'react';

import { ACCESS_STATES } from '../../../shared/constants';
import type { AccessState, Asset, Endpoint, Feature, TestRecord } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';
import { EndpointEditor } from './EndpointEditor';
import { EndpointImportPanel } from './EndpointImportPanel';
import {
  ACCESS_BADGE,
  RESP_HINT,
  coverageOf,
  methodClass,
  paramSummary,
} from './endpointUi';

export interface EndpointsPageProps {
  projectId: string;
  assets: Asset[];
  endpoints: Endpoint[];
  tests: TestRecord[];
  features: Feature[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  /** 跳到图谱并聚焦 api:<endpointId> */
  onViewInGraph: (endpoint: Endpoint) => void;
}

export function EndpointsPage({
  projectId,
  assets,
  endpoints,
  tests,
  features,
  loading,
  onRefresh,
  onViewInGraph,
}: EndpointsPageProps): JSX.Element {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [accessFilter, setAccessFilter] = useState<AccessState | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchState, setBatchState] = useState<AccessState>('未测试');
  const [batching, setBatching] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Endpoint | null>(null);
  const [deleting, setDeleting] = useState(false);

  const stats = useMemo(() => {
    return {
      total: endpoints.length,
      diff: endpoints.filter((item) => item.diffSurface).length,
      sameGate: endpoints.filter((item) => item.respSignature === '仅登录码').length,
      untested: endpoints.filter((item) => item.accessState === '未测试').length,
    };
  }, [endpoints]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return endpoints.filter((endpoint) => {
      if (assetFilter !== 'all' && endpoint.assetId !== assetFilter) return false;
      if (accessFilter !== 'all' && endpoint.accessState !== accessFilter) return false;
      if (!keyword) return true;
      return [
        endpoint.method,
        endpoint.path,
        endpoint.fullUrl,
        endpoint.source,
        endpoint.accessState,
        endpoint.respSignature,
        endpoint.note,
        ...endpoint.params.map((item) => item.name),
        ...endpoint.keys,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [endpoints, search, assetFilter, accessFilter]);

  const groups = useMemo(() => {
    const visibleAssets =
      assetFilter === 'all' ? assets : assets.filter((asset) => asset.id === assetFilter);
    return visibleAssets
      .map((asset) => ({
        asset,
        items: filtered.filter((endpoint) => endpoint.assetId === asset.id),
      }))
      .filter((group) => group.items.length > 0 || assetFilter !== 'all');
  }, [assets, filtered, assetFilter]);

  const filteredIds = useMemo(() => filtered.map((item) => item.id), [filtered]);
  const allVisibleSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  const toggleAllVisible = useCallback((): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allVisibleSelected, filteredIds]);

  const toggleOne = useCallback((id: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openCreate = useCallback((): void => {
    setEditing(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((endpoint: Endpoint): void => {
    setEditing(endpoint);
    setEditorOpen(true);
  }, []);

  const afterSaved = useCallback(async (): Promise<void> => {
    await onRefresh();
  }, [onRefresh]);

  const applyBatch = useCallback(async (): Promise<void> => {
    if (selected.size === 0) return;
    setBatching(true);
    try {
      const result = await api.batchSetAccessState(projectId, {
        ids: [...selected],
        accessState: batchState,
      });
      toast('success', `已批量更新 ${result.updated} 条接口`);
      setSelected(new Set());
      await onRefresh();
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setBatching(false);
    }
  }, [batchState, onRefresh, projectId, selected, toast]);

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteEndpoint(projectId, pendingDelete.id);
      toast('success', `接口 ${pendingDelete.method} ${pendingDelete.path} 已删除`);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(pendingDelete.id);
        return next;
      });
      setPendingDelete(null);
      await onRefresh();
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setDeleting(false);
    }
  }, [onRefresh, pendingDelete, projectId, toast]);

  const defaultAssetId = assetFilter !== 'all' ? assetFilter : (assets[0]?.id ?? '');

  return (
    <div className="hx-content-inner">
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">接口清单</h1>
          <div className="hx-crumb">
            项目 {projectId} · {stats.total} 条接口 · {assets.length} 个资产
          </div>
        </div>
        <div className="hx-spacer" />
        <button type="button" className="hx-btn" onClick={() => setImportOpen(true)}>
          <Icon name="arrowRight" size={13} />
          批量导入
        </button>
        <button type="button" className="hx-btn hx-btn-primary" onClick={openCreate}>
          <Icon name="plus" size={13} />
          新建接口
        </button>
      </div>

      <div className="hx-stat-row">
        <div className="hx-stat">
          <div className="hx-stat-label">接口总数</div>
          <div className="hx-stat-value">{stats.total}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">有差分面</div>
          <div className="hx-stat-value">{stats.diff}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">同闸（仅登录码）</div>
          <div className="hx-stat-value">{stats.sameGate}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">未测试</div>
          <div className="hx-stat-value">
            {stats.untested}
            <em> / {stats.total}</em>
          </div>
        </div>
      </div>

      <div className="hx-filter-bar">
        <div className="hx-search" style={{ flex: '1 1 220px', minWidth: 200 }}>
          <Icon name="search" size={13} />
          <input
            type="text"
            value={search}
            placeholder="搜索 path / 参数 / 来源 / 备注"
            onChange={(event) => setSearch(event.target.value)}
            aria-label="搜索接口"
          />
        </div>
        <select
          className="hx-select"
          style={{ width: 170 }}
          value={assetFilter}
          onChange={(event) => setAssetFilter(event.target.value)}
          aria-label="按资产筛选"
        >
          <option value="all">全部资产</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
        <select
          className="hx-select"
          style={{ width: 180 }}
          value={accessFilter}
          onChange={(event) => setAccessFilter(event.target.value as AccessState | 'all')}
          aria-label="按可访问性筛选"
        >
          <option value="all">可访问性：全部</option>
          {ACCESS_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="hx-btn hx-btn-sm hx-btn-ghost"
          onClick={toggleAllVisible}
          disabled={filteredIds.length === 0}
        >
          {allVisibleSelected ? '取消全选' : '全选当前'}
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="hx-batch-bar">
          <Icon name="check" size={13} />
          <span>已选 {selected.size} 条</span>
          <select
            className="hx-select hx-select-sm"
            value={batchState}
            onChange={(event) => setBatchState(event.target.value as AccessState)}
            aria-label="批量设置可访问性"
          >
            {ACCESS_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="hx-btn hx-btn-sm hx-btn-primary"
            onClick={() => void applyBatch()}
            disabled={batching}
          >
            批量设为该状态
          </button>
          <button
            type="button"
            className="hx-btn hx-btn-sm hx-btn-ghost"
            onClick={() => setSelected(new Set())}
          >
            清空选择
          </button>
        </div>
      ) : null}

      {loading && endpoints.length === 0 ? (
        <div className="hx-empty">
          <Icon name="spinner" size={20} className="hx-spin" />
          <div>正在读取接口清单…</div>
        </div>
      ) : endpoints.length === 0 ? (
        <div className="hx-empty hx-empty-tall">
          <Icon name="endpoints" size={24} />
          <div style={{ color: 'var(--strong)', fontSize: 14 }}>还没有接口</div>
          <div style={{ maxWidth: 620, lineHeight: 1.9 }}>
            <span style={{ color: 'var(--strong)' }}>锁面模式</span>：手录 / 粘 curl / 粘 Swagger，先把接口记全；
            <br />
            <span style={{ color: 'var(--strong)' }}>自由跳模式</span>：从种子队列批量导入（后续块开放）。
            <br />
            回包特征里「仅登录码」和「空列表」必须分清：前者同闸，后者有差分面。
          </div>
          <div className="hx-row">
            <button type="button" className="hx-btn hx-btn-primary" onClick={openCreate}>
              <Icon name="plus" size={13} />
              新建接口
            </button>
            <button type="button" className="hx-btn" onClick={() => setImportOpen(true)}>
              批量导入
            </button>
          </div>
        </div>
      ) : (
        <div className="hx-card" style={{ padding: '4px 6px' }}>
          {groups.map((group) => (
            <section key={group.asset.id} className="hx-endpoint-group">
              <div className="hx-endpoint-group-head">
                <Icon name="assets" size={13} />
                <strong>{group.asset.name}</strong>
                <span className="hx-badge">{group.items.length} 条</span>
                <span className="hx-hint hx-mono" title={group.asset.url || '未填 URL'}>
                  {group.asset.url || group.asset.host || group.asset.ip || '未填地址'}
                </span>
                <span className="hx-spacer" />
                <button
                  type="button"
                  className="hx-btn hx-btn-sm hx-btn-ghost"
                  onClick={() => {
                    setAssetFilter(group.asset.id);
                    setEditing(null);
                    setEditorOpen(true);
                  }}
                >
                  给该资产加接口
                </button>
              </div>

              <div className="hx-table-wrap">
                <table className="hx-table hx-endpoint-table">
                  <colgroup>
                    <col style={{ width: 104 }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: 84 }} />
                    <col style={{ width: 158 }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: 76 }} />
                    <col style={{ width: 72 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 104 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>
                        <label className="hx-check-inline" title="全选当前筛选结果">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisible}
                            aria-label="全选当前筛选结果"
                          />
                          METHOD
                        </label>
                      </th>
                      <th>path</th>
                      <th>来源</th>
                      <th>可访问性</th>
                      <th>回包特征</th>
                      <th>差分面</th>
                      <th>参数数</th>
                      <th>测试覆盖</th>
                      <th style={{ textAlign: 'right' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((endpoint) => {
                      const hint = RESP_HINT[endpoint.respSignature];
                      const coverage = coverageOf(tests, endpoint.id);
                      return (
                        <tr key={endpoint.id} className={selected.has(endpoint.id) ? 'hx-row-selected' : ''}>
                          <td>
                            <label className="hx-check-inline">
                              <input
                                type="checkbox"
                                checked={selected.has(endpoint.id)}
                                onChange={() => toggleOne(endpoint.id)}
                                aria-label={`选择 ${endpoint.method} ${endpoint.path}`}
                              />
                              <span className={`hx-badge ${methodClass(endpoint.method)}`}>
                                {endpoint.method}
                              </span>
                            </label>
                          </td>
                          <td>
                            <div className="hx-cell-clip hx-mono" title={endpoint.fullUrl || endpoint.path}>
                              {endpoint.path}
                            </div>
                            {endpoint.fullUrl ? (
                              <div className="hx-cell-clip hx-mono hx-hint" style={{ fontSize: 10 }} title={endpoint.fullUrl}>
                                {endpoint.fullUrl}
                              </div>
                            ) : null}
                          </td>
                          <td><span className="hx-badge">{endpoint.source}</span></td>
                          <td>
                            <span className={`hx-badge ${ACCESS_BADGE[endpoint.accessState]}`}>
                              {endpoint.accessState}
                            </span>
                          </td>
                          <td>
                            <div className="hx-resp-cell" title={hint.text}>
                              <span className="hx-badge">{endpoint.respSignature}</span>
                              {hint.tone !== 'normal' ? (
                                <div className={`hx-resp-short ${hint.tone}`}>
                                  {hint.tone === 'samegate' ? '同闸 · 四件套 N/A' : '有差分面，必须测'}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`hx-badge ${endpoint.diffSurface ? 'hx-badge-amber' : 'hx-badge-dim'}`}
                              title={hint.text}
                            >
                              {endpoint.diffSurface ? '有' : '无'}
                            </span>
                          </td>
                          <td>
                            <span className="hx-badge" title={paramSummary(endpoint)}>
                              {endpoint.params.length}
                            </span>
                          </td>
                          <td>
                            <span className="hx-badge" title={coverage.title}>
                              {coverage.label}
                            </span>
                          </td>
                          <td>
                            <div className="hx-row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                              <button
                                type="button"
                                className="hx-icon-btn"
                                onClick={() => onViewInGraph(endpoint)}
                                title="在图谱中查看"
                                aria-label={`在图谱中查看 ${endpoint.path}`}
                              >
                                <Icon name="graph" size={12} />
                              </button>
                              <button
                                type="button"
                                className="hx-btn hx-btn-sm"
                                onClick={() => openEdit(endpoint)}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                className="hx-icon-btn"
                                onClick={() => setPendingDelete(endpoint)}
                                title="删除接口"
                                aria-label={`删除 ${endpoint.path}`}
                              >
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

              {group.items.length === 0 ? (
                <div className="hx-empty" style={{ margin: 12 }}>
                  <div>该资产还没有接口</div>
                  <button
                    type="button"
                    className="hx-btn hx-btn-sm"
                    onClick={() => {
                      setAssetFilter(group.asset.id);
                      setEditing(null);
                      setEditorOpen(true);
                    }}
                  >
                    新建一条
                  </button>
                </div>
              ) : null}
            </section>
          ))}

          {groups.length === 0 ? (
            <div className="hx-empty" style={{ margin: 12 }}>
              <Icon name="search" size={18} />
              <div>没有匹配的接口</div>
              <div>换个关键词，或清空筛选条件。</div>
            </div>
          ) : null}

          <div className="hx-table-foot">
            <span className="hx-hint">
              显示 {filtered.length} / {endpoints.length} 条 · 按资产分组
            </span>
            <span className="hx-spacer" />
            <span className="hx-hint" style={{ fontSize: 11 }}>
              仅登录码 = 同闸（四件套 N/A）；空列表 / 报错500 / 超时 = 有差分面，必须测
            </span>
          </div>
        </div>
      )}

      <EndpointEditor
        open={editorOpen}
        projectId={projectId}
        endpoint={editing}
        assets={assets}
        features={features}
        defaultAssetId={defaultAssetId}
        onClose={() => setEditorOpen(false)}
        onSaved={afterSaved}
      />

      <EndpointImportPanel
        open={importOpen}
        projectId={projectId}
        assets={assets}
        defaultAssetId={defaultAssetId}
        onClose={() => setImportOpen(false)}
        onImported={afterSaved}
      />

      <Modal
        open={pendingDelete !== null}
        title="删除这条接口？"
        subtitle="会同时清掉测试记录 / 报告里指向它的 endpointId，不会留孤儿引用。"
        onClose={() => setPendingDelete(null)}
        maxWidth={440}
        footer={
          <>
            <button type="button" className="hx-btn" onClick={() => setPendingDelete(null)} disabled={deleting}>
              取消
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-danger"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              删除
            </button>
          </>
        }
      >
        <div className="hx-mono" style={{ wordBreak: 'break-all' }}>
          {pendingDelete ? `${pendingDelete.method} ${pendingDelete.path}` : ''}
        </div>
      </Modal>
    </div>
  );
}
