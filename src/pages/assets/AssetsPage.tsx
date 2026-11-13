/**
 * 第 4 页「资产库」：统计 + 过滤 + 表格 + 编辑抽屉。
 *
 * 数据来源：
 * - 资产列表由 App 的 `ProjectData` 传入，保存 / 删除后调 `onRefresh` 重新拉项目数据；
 * - 指纹库在进入本页时拉一次（`GET /api/fingerprints`），只在编辑抽屉里用。
 *
 * 过滤全部在前端做（数据量是单项目的量级，没必要走服务端）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ALIVE_STATUSES,
  ASSET_CATEGORY_KEYS,
  CATEGORIES,
  CHECKLIST_ITEMS,
  OWNERSHIPS,
} from '../../../shared/constants';
import { summarizeFp } from '../../../shared/fpDerive';
import type { Asset, AssetCategory, AssetOwnership, AliveStatus, Fingerprint } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';
import { AssetEditor } from './AssetEditor';
import { checklistDone, checklistProgress } from './assetForm';

export interface AssetsPageProps {
  projectId: string;
  assets: Asset[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  /** 「在图谱中查看」：跳到图谱页并聚焦对应节点 */
  onViewInGraph: (asset: Asset) => void;
}

type CoveredFilter = 'all' | 'covered' | 'uncovered';

const ALIVE_CLASS: Record<AliveStatus, string> = {
  存活: 'hx-badge-green',
  '401': 'hx-badge-blue',
  '403': 'hx-badge-amber',
  登录墙: 'hx-badge-violet',
  停放页: 'hx-badge-dim',
  超时: 'hx-badge-dim',
  死链: 'hx-badge-dim',
  未探活: 'hx-badge',
};

function aliveClass(status: AliveStatus): string {
  return ALIVE_CLASS[status] ?? 'hx-badge';
}

export function AssetsPage({
  projectId,
  assets,
  loading,
  onRefresh,
  onViewInGraph,
}: AssetsPageProps): JSX.Element {
  const toast = useToast();

  const [library, setLibrary] = useState<Fingerprint[]>([]);
  const [libLoading, setLibLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<AssetCategory | 'all'>('all');
  const [ownership, setOwnership] = useState<AssetOwnership | 'all'>('all');
  const [alive, setAlive] = useState<AliveStatus | 'all'>('all');
  const [coveredFilter, setCoveredFilter] = useState<CoveredFilter>('all');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* 指纹库只在进入本页时拉一次 */
  useEffect(() => {
    let cancelled = false;
    setLibLoading(true);
    api
      .listFingerprints()
      .then((payload) => {
        if (!cancelled) setLibrary(payload.items);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast('error', toErrorText(error, '指纹库读取失败，编辑抽屉的候选会是空的'));
      })
      .finally(() => {
        if (!cancelled) setLibLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const stats = useMemo(() => {
    const covered = assets.filter((asset) => asset.covered).length;
    const withVuln = assets.filter((asset) =>
      asset.vulnRefs.some((ref) => ref.status !== '不适用'),
    ).length;
    const fat = assets.filter((asset) => asset.weight === 'fat').length;
    return { total: assets.length, covered, withVuln, fat };
  }, [assets]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (category !== 'all' && asset.category !== category) return false;
      if (ownership !== 'all' && asset.ownership !== ownership) return false;
      if (alive !== 'all' && asset.aliveStatus !== alive) return false;
      if (coveredFilter === 'covered' && !asset.covered) return false;
      if (coveredFilter === 'uncovered' && asset.covered) return false;
      if (!keyword) return true;
      const haystack = [
        asset.name,
        asset.url,
        asset.host,
        asset.ip,
        asset.title,
        asset.sameSkinGroup,
        asset.fingerprints.join(' '),
        summarizeFp(asset.fp),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [assets, search, category, ownership, alive, coveredFilter]);

  const openCreate = useCallback((): void => {
    setEditing(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((asset: Asset): void => {
    setEditing(asset);
    setEditorOpen(true);
  }, []);

  const handleSaved = useCallback(
    async (): Promise<void> => {
      setEditorOpen(false);
      setEditing(null);
      await onRefresh();
    },
    [onRefresh],
  );

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteAsset(projectId, pendingDelete.id);
      toast('success', `资产「${pendingDelete.name}」已删除`);
      setPendingDelete(null);
      await onRefresh();
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, projectId, toast, onRefresh]);

  const hasFilters =
    search.trim() !== '' ||
    category !== 'all' ||
    ownership !== 'all' ||
    alive !== 'all' ||
    coveredFilter !== 'all';

  const resetFilters = (): void => {
    setSearch('');
    setCategory('all');
    setOwnership('all');
    setAlive('all');
    setCoveredFilter('all');
  };

  return (
    <div className="hx-content-inner">
      {/* 标题 + 统计 -------------------------------------------------- */}
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">资产库</h1>
          <div className="hx-crumb">
            项目 {projectId} · 共 {stats.total} 条资产 · 覆盖 {stats.covered} 条
          </div>
        </div>
        <div className="hx-spacer" />
        <button type="button" className="hx-btn hx-btn-primary" onClick={openCreate}>
          <Icon name="plus" size={13} />
          新建资产
        </button>
      </div>

      <div className="hx-stat-row">
        <div className="hx-stat">
          <div className="hx-stat-label">资产总数</div>
          <div className="hx-stat-value">{stats.total}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">已覆盖</div>
          <div className="hx-stat-value">
            {stats.covered}
            <em> / {stats.total}</em>
          </div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">有历史漏洞</div>
          <div className="hx-stat-value">{stats.withVuln}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">肥面</div>
          <div className="hx-stat-value">
            {stats.fat}
            <em> / {stats.total}</em>
          </div>
        </div>
      </div>

      {/* 过滤行 ------------------------------------------------------ */}
      <div className="hx-filter-bar">
        <div className="hx-search" style={{ flex: '1 1 240px', minWidth: 200 }}>
          <Icon name="search" size={13} />
          <input
            type="text"
            value={search}
            placeholder="搜索名称 / URL / host / IP / 指纹"
            onChange={(event) => setSearch(event.target.value)}
            aria-label="搜索资产"
          />
        </div>
        <select
          className="hx-select"
          style={{ width: 140 }}
          value={category}
          onChange={(event) => setCategory(event.target.value as AssetCategory | 'all')}
          aria-label="按类别过滤"
        >
          <option value="all">全部类别</option>
          {ASSET_CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>
              {CATEGORIES[key].label}
            </option>
          ))}
        </select>
        <select
          className="hx-select"
          style={{ width: 110 }}
          value={ownership}
          onChange={(event) => setOwnership(event.target.value as AssetOwnership | 'all')}
          aria-label="按归属过滤"
        >
          <option value="all">全部归属</option>
          {OWNERSHIPS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          className="hx-select"
          style={{ width: 120 }}
          value={alive}
          onChange={(event) => setAlive(event.target.value as AliveStatus | 'all')}
          aria-label="按存活状态过滤"
        >
          <option value="all">全部存活</option>
          {ALIVE_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          className="hx-select"
          style={{ width: 120 }}
          value={coveredFilter}
          onChange={(event) => setCoveredFilter(event.target.value as CoveredFilter)}
          aria-label="按覆盖状态过滤"
        >
          <option value="all">覆盖：全部</option>
          <option value="covered">已覆盖</option>
          <option value="uncovered">未覆盖</option>
        </select>
        {hasFilters ? (
          <button type="button" className="hx-btn hx-btn-sm hx-btn-ghost" onClick={resetFilters}>
            清空过滤
          </button>
        ) : null}
      </div>

      {/* 空状态 / 表格 ----------------------------------------------- */}
      {loading && assets.length === 0 ? (
        <div className="hx-empty">
          <Icon name="spinner" size={20} className="hx-spin" />
          <div>正在读取资产…</div>
        </div>
      ) : assets.length === 0 ? (
        <div className="hx-empty hx-empty-tall">
          <Icon name="assets" size={24} />
          <div style={{ color: 'var(--strong)', fontSize: 14 }}>资产库还是空的</div>
          <div style={{ maxWidth: 620, lineHeight: 1.9 }}>
            资产从哪来？
            <br />
            · <span style={{ color: 'var(--strong)' }}>锁面模式</span>：把你授权范围内的域名 / 后台 /
            API 手录进来，一个资产一条；
            <br />· <span style={{ color: 'var(--strong)' }}>自由跳模式</span>
            ：从种子队列的查询方向批量导入（暂未开放），按种子闭环逐个做。
            <br />
            先建一条，填完技术栈就会自动带出攻击面与历史漏洞。
          </div>
          <button type="button" className="hx-btn hx-btn-primary" onClick={openCreate}>
            <Icon name="plus" size={13} />
            新建资产
          </button>
        </div>
      ) : (
        <div className="hx-card" style={{ padding: '4px 6px' }}>
          <div className="hx-table-wrap">
            <table className="hx-table hx-asset-table">
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 54 }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: 118 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 66 }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>资产</th>
                  <th>类别</th>
                  <th>权重</th>
                  <th>URL</th>
                  <th>IP : 端口</th>
                  <th>归属</th>
                  <th>存活</th>
                  <th>指纹</th>
                  <th>覆盖</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((asset) => {
                  const done = checklistDone(asset.checklist);
                  const percent = checklistProgress(asset.checklist);
                  const meta = CATEGORIES[asset.category];
                  return (
                    <tr key={asset.id}>
                      <td>
                        <div style={{ color: 'var(--strong)' }}>{asset.name}</div>
                        <div className="hx-mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
                          {asset.host || '—'}
                          {asset.title ? ` · ${asset.title}` : ''}
                        </div>
                      </td>
                      <td>
                        <span
                          className="hx-badge"
                          style={{ color: meta.colorVar, borderColor: meta.colorVar }}
                          title={meta.label}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <span className={`hx-badge ${asset.weight === 'fat' ? 'hx-badge-amber' : ''}`}>
                          {asset.weight === 'fat' ? '肥面' : '瘦壳'}
                        </span>
                      </td>
                      <td>
                        <div className="hx-cell-clip hx-mono" title={asset.url || '未填 URL'}>
                          {asset.url || <span style={{ color: 'var(--dim)' }}>—</span>}
                        </div>
                      </td>
                      <td
                        className="hx-mono hx-cell-clip"
                        style={{ fontSize: 11, maxWidth: 150 }}
                        title={`${asset.ip || '—'}${asset.port !== null ? ` : ${asset.port}` : ''}`}
                      >
                        {asset.ip || '—'}
                        {asset.port !== null ? ` : ${asset.port}` : ''}
                      </td>
                      <td>
                        <span className="hx-badge">{asset.ownership}</span>
                      </td>
                      <td>
                        <span className={`hx-badge ${aliveClass(asset.aliveStatus)}`}>
                          {asset.aliveStatus}
                        </span>
                      </td>
                      <td title={asset.fingerprints.join(' / ') || '未填技术栈'}>
                        <div className="hx-cell-clip hx-mono" style={{ fontSize: 11 }}>
                          {summarizeFp(asset.fp) || (
                            <span style={{ color: 'var(--dim)' }}>未填</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="hx-progress hx-progress-mini">
                          <div
                            className={`hx-progress-bar${done === CHECKLIST_ITEMS.length ? ' done' : ''}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="hx-mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
                          {done}/{CHECKLIST_ITEMS.length}
                        </div>
                      </td>
                      <td>
                        <div className="hx-row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                          <button
                            type="button"
                            className="hx-icon-btn"
                            onClick={() => onViewInGraph(asset)}
                            title="在图谱中查看"
                            aria-label={`在图谱中查看 ${asset.name}`}
                          >
                            <Icon name="graph" size={12} />
                          </button>
                          <button
                            type="button"
                            className="hx-btn hx-btn-sm"
                            onClick={() => openEdit(asset)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="hx-icon-btn"
                            onClick={() => setPendingDelete(asset)}
                            title="删除资产"
                            aria-label={`删除 ${asset.name}`}
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

          {filtered.length === 0 ? (
            <div className="hx-empty" style={{ margin: 12 }}>
              <Icon name="search" size={18} />
              <div>没有匹配的资产</div>
              <div style={{ maxWidth: 420 }}>
                当前过滤条件下 0 条。清空过滤，或换个关键词再试。
              </div>
              <button type="button" className="hx-btn hx-btn-sm" onClick={resetFilters}>
                清空过滤
              </button>
            </div>
          ) : null}

          <div className="hx-table-foot">
            <span className="hx-hint">
              显示 {filtered.length} / {assets.length} 条
              {libLoading ? ' · 指纹库加载中…' : ''}
            </span>
            <span className="hx-spacer" />
            <span className="hx-hint" style={{ fontSize: 11 }}>
              覆盖 = 11 项「本轮完成」全勾；服务端算，列表只展示
            </span>
          </div>
        </div>
      )}

      {/* 编辑抽屉 */}
      <AssetEditor
        open={editorOpen}
        projectId={projectId}
        asset={editing}
        library={library}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          void handleSaved();
        }}
      />

      {/* 删除确认 */}
      <Modal
        open={pendingDelete !== null}
        title="确认删除资产？"
        subtitle={pendingDelete ? `将删除 ${pendingDelete.name}（${pendingDelete.id}）` : undefined}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        locked={deleting}
        maxWidth={480}
        footer={
          <>
            <button
              type="button"
              className="hx-btn"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              取消
            </button>
            <button
              type="button"
              className="hx-btn hx-btn-danger"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Icon name="spinner" size={13} className="hx-spin" />
                  删除中…
                </>
              ) : (
                <>
                  <Icon name="trash" size={13} />
                  确认删除
                </>
              )}
            </button>
          </>
        }
      >
        {pendingDelete ? (
          <div className="hx-hint">
            会连带删除该资产下的
            <span style={{ color: 'var(--strong)' }}> 接口清单 / 测试记录 / 漏洞报告 / 功能点</span>
            。
            <br />
            已带出的历史漏洞随资产一起消失，<span style={{ color: 'var(--red)' }}>不可撤销</span>。
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
