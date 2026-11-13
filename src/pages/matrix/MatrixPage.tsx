/**
 * 阶段 5「测试矩阵」页面。
 *
 * 三个页签：全部矩阵 / 分工视图 / 覆盖统计。
 * 数据来自 App 的 ProjectData，写操作走本地 API 后统一 onRefresh。
 * 只做记录与展示，不发包、不扫描、不导出任务文件。
 */

import { Fragment, useCallback, useMemo, useState } from 'react';

import { NA_REASONS } from '../../../shared/constants';
import type {
  Asset,
  Endpoint,
  NaReason,
  TestRecord,
  TestState,
  VulnCatalogEntry,
} from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { useToast } from '../../components/Toast';
import { api, toErrorText } from '../../lib/api';
import { CellEditor } from './CellEditor';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CORS_VULN_ID,
  EXEC_MODE_META,
  EXEC_MODE_ORDER,
  buildColumns,
  buildRows,
  buildTestMap,
  buildTodos,
  cellKey,
  coverageStats,
  groupRows,
  isDone,
  signalHits,
  stateOf,
} from './matrixModel';
import type { CoverageBucket, MatrixRow, MatrixView } from './matrixModel';

export interface MatrixPageProps {
  projectId: string;
  assets: Asset[];
  endpoints: Endpoint[];
  tests: TestRecord[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

type TabKey = 'all' | 'work' | 'coverage';

const ROW_COL_WIDTH = 220;
const COL_WIDTH = 112;
const CORS_COL_WIDTH = 120;

interface EditorTarget {
  row: MatrixRow;
  entry: VulnCatalogEntry;
  record: TestRecord | null;
}

interface CellRef {
  row: MatrixRow;
  entry: VulnCatalogEntry;
}

function stateClass(state: TestState): string {
  switch (state) {
    case '打穿':
      return 'state-pwned';
    case '证伪':
      return 'state-refuted';
    case 'N-A':
      return 'state-na';
    default:
      return 'state-untested';
  }
}

function matrixViewLabel(view: MatrixView): string {
  return view === 'default'
    ? '默认'
    : `${view} 类 · ${CATEGORY_LABELS[view]}`;
}

function renderBar(bucket: CoverageBucket): JSX.Element {
  return (
    <div className="hx-bar-row" key={bucket.key}>
      <div className="hx-bar-label" title={bucket.label}>
        {bucket.label}
      </div>
      <div className="hx-bar-track">
        <div className="hx-bar-fill" style={{ width: `${bucket.percent}%` }} />
      </div>
      <div className="hx-bar-value hx-mono">
        {bucket.done} / {bucket.total} · {bucket.percent}%
      </div>
    </div>
  );
}

export function MatrixPage({
  projectId,
  assets,
  endpoints,
  tests,
  loading,
  onRefresh,
}: MatrixPageProps): JSX.Element {
  const toast = useToast();

  const [tab, setTab] = useState<TabKey>('all');
  const [view, setView] = useState<MatrixView>('default');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchReason, setBatchReason] = useState<NaReason | ''>('');
  const [batching, setBatching] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const rows = useMemo(() => buildRows(assets, endpoints), [assets, endpoints]);
  const testMap = useMemo(() => buildTestMap(tests), [tests]);
  const columns = useMemo(() => buildColumns(view), [view]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const todos = useMemo(() => buildTodos(rows, tests), [rows, tests]);
  const coverage = useMemo(() => coverageStats(rows, tests), [rows, tests]);

  const cellIndex = useMemo(() => {
    const map = new Map<string, CellRef>();
    for (const row of rows) {
      for (const entry of columns.columns) {
        if (entry.id === CORS_VULN_ID) continue;
        map.set(`${row.key}::${entry.id}`, { row, entry });
      }
    }
    return map;
  }, [rows, columns]);

  const selectedCells = useMemo(() => {
    const result: CellRef[] = [];
    for (const key of selected) {
      const cell = cellIndex.get(key);
      if (cell) result.push(cell);
    }
    return result;
  }, [selected, cellIndex]);

  const doneCount = tests.filter((item) => isDone(item.state)).length;
  const naCount = tests.filter((item) => item.state === 'N-A').length;

  const toggleSelected = useCallback((key: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectMatrixView = useCallback((next: MatrixView): void => {
    setView(next);
    setSelected(new Set());
  }, []);

  const openEditor = useCallback(
    (row: MatrixRow, entry: VulnCatalogEntry, record: TestRecord | null): void => {
      if (entry.id === CORS_VULN_ID) return;
      setEditor({ row, entry, record });
    },
    [],
  );

  const handleSaved = useCallback(async (): Promise<void> => {
    await onRefresh();
  }, [onRefresh]);

  const applyBatch = useCallback(async (): Promise<void> => {
    if (selectedCells.length === 0) return;
    if (!batchReason) {
      toast('error', '批量设 N-A 必须先选择原因');
      return;
    }
    setBatching(true);
    try {
      const cells = selectedCells.map(({ row, entry }) => ({
        assetId: row.assetId,
        endpointId: row.endpointId,
        vulnType: entry.id,
        state: 'N-A' as const,
        naReason: batchReason,
        payload: '',
        baseline: '',
        evidence: '',
      }));
      const result = await api.batchSetTestCells(projectId, { cells });
      toast(
        'success',
        `批量写入 ${cells.length} 格：新增 ${result.created} / 更新 ${result.updated}`,
      );
      setSelected(new Set());
      await onRefresh();
    } catch (error) {
      toast('error', toErrorText(error));
    } finally {
      setBatching(false);
    }
  }, [batchReason, onRefresh, projectId, selectedCells, toast]);

  const renderColumnHead = (entry: VulnCatalogEntry): JSX.Element => {
    const meta = EXEC_MODE_META[entry.execMode];
    const isCors = entry.id === CORS_VULN_ID;
    return (
      <th
        key={entry.id}
        className={`hx-matrix-col-head${isCors ? ' cors' : ''}`}
        title={`${entry.passCondition}\n最低探针：${entry.minProbe}${
          isCors ? '\n固定禁用，不可修改' : ''
        }`}
      >
        <div className="hx-row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          <span className={`hx-badge ${meta.badge}`}>{meta.label}</span>
          <span className="hx-mono hx-hint" style={{ fontSize: 10 }}>
            {entry.id}
          </span>
        </div>
        <div className="hx-cell-clip" title={entry.name}>
          {entry.name}
        </div>
      </th>
    );
  };

  const renderCell = (row: MatrixRow, entry: VulnCatalogEntry): JSX.Element => {
    const key = `${row.key}::${entry.id}`;
    if (entry.id === CORS_VULN_ID) {
      return (
        <td key={key} className="hx-matrix-cell-td">
          <div className="hx-matrix-cell state-na cors" title="CORS 按方法论固定不挖，不可修改">
            <span className="hx-matrix-state-label">N-A</span>
            <span className="hx-matrix-reason">CORS不挖</span>
          </div>
        </td>
      );
    }

    const record = testMap.get(cellKey(row.endpointId, row.assetId, entry.id)) ?? null;
    const state = stateOf(record);
    const signals = state === '未测' ? signalHits(row, entry) : [];
    const isSelected = selected.has(key);

    return (
      <td key={key} className="hx-matrix-cell-td">
        <div className={`hx-matrix-cell ${stateClass(state)}${isSelected ? ' selected' : ''}`}>
          <label
            className="hx-matrix-select"
            onClick={(event) => event.stopPropagation()}
            title="多选后可批量设 N-A"
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelected(key)}
              aria-label={`选择 ${row.label} / ${entry.id}`}
            />
          </label>
          <button
            type="button"
            className="hx-matrix-cell-btn"
            onClick={() => openEditor(row, entry, record)}
            title={`${row.label} · ${entry.id} · ${state}${
              record?.naReason ? ` / ${record.naReason}` : ''
            }`}
          >
            <span className="hx-matrix-state-label">{state}</span>
            {state === 'N-A' && record?.naReason ? (
              <span className="hx-matrix-reason">{record.naReason}</span>
            ) : null}
            {signals.length > 0 ? (
              <span
                className="hx-matrix-signal"
                title={`待测·有信号：${signals.join(' / ')}`}
                aria-label="待测·有信号"
              />
            ) : null}
          </button>
        </div>
      </td>
    );
  };

  const renderAllTab = (): JSX.Element => {
    if (loading && rows.length === 0) {
      return (
        <div className="hx-empty">
          <Icon name="spinner" size={20} className="hx-spin" />
          <div>正在读取测试矩阵…</div>
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="hx-empty hx-empty-tall">
          <Icon name="matrix" size={24} />
          <div style={{ color: 'var(--strong)', fontSize: 14 }}>还没有可测的行</div>
          <div style={{ maxWidth: 620, lineHeight: 1.9 }}>
            先去接口清单录接口；若连资产都还没有，先到资产库建资产。
            <br />
            矩阵会以接口为行；没有接口时才退回到资产级行。
          </div>
        </div>
      );
    }

    const tableWidth =
      ROW_COL_WIDTH +
      columns.columns.reduce(
        (sum, entry) => sum + (entry.id === CORS_VULN_ID ? CORS_COL_WIDTH : COL_WIDTH),
        0,
      );

    return (
      <>
        {endpoints.length === 0 ? (
          <div className="hx-matrix-notice">
            当前没有接口，矩阵按资产显示；先去接口清单录接口，可切换到接口级行。
          </div>
        ) : null}

        {selectedCells.length > 0 ? (
          <div className="hx-batch-bar">
            <Icon name="check" size={13} />
            <span>已选 {selectedCells.length} 格</span>
            <select
              className="hx-select hx-select-sm"
              value={batchReason}
              onChange={(event) => setBatchReason(event.target.value as NaReason | '')}
              aria-label="批量设 N-A 原因"
            >
              <option value="">选择 N-A 原因</option>
              {NA_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="hx-btn hx-btn-sm hx-btn-primary"
              onClick={() => void applyBatch()}
              disabled={batching}
            >
              批量设 N-A
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

        <div className="hx-row" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
          {(['default', ...CATEGORY_ORDER] as MatrixView[]).map((nextView) => (
            <button
              key={nextView}
              type="button"
              className={`hx-btn hx-btn-sm${view === nextView ? ' hx-btn-primary' : ''}`}
              onClick={() => selectMatrixView(nextView)}
            >
              {matrixViewLabel(nextView)}
            </button>
          ))}
          <span className="hx-hint">
            默认 12 列 + 末尾 CORS；点一类只展开该类
          </span>
        </div>

        <div className="hx-card" style={{ padding: '4px 6px' }}>
          <div className="hx-table-wrap">
            <table className="hx-table hx-matrix-table" style={{ width: tableWidth }}>
              <colgroup>
                <col style={{ width: ROW_COL_WIDTH }} />
                {columns.columns.map((entry) => (
                  <col
                    key={entry.id}
                    style={{ width: entry.id === CORS_VULN_ID ? CORS_COL_WIDTH : COL_WIDTH }}
                  />
                ))}
              </colgroup>
              <thead>
                {view !== 'default' ? (
                  <>
                    <tr className="hx-matrix-group-head">
                      <th rowSpan={2}>行 / 接口</th>
                      {columns.groups.map((group) => (
                        <th
                          key={group.key}
                          colSpan={group.columns.length}
                          className={group.key === 'cors' ? 'hx-matrix-cors-group' : ''}
                        >
                          {group.label}
                        </th>
                      ))}
                    </tr>
                    <tr>{columns.columns.map(renderColumnHead)}</tr>
                  </>
                ) : (
                  <tr>
                    <th>行 / 接口</th>
                    {columns.columns.map(renderColumnHead)}
                  </tr>
                )}
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.asset.id}>
                    <tr className="hx-matrix-group-row">
                      <td colSpan={columns.columns.length + 1}>
                        <Icon name="assets" size={12} />
                        <strong>{group.asset.name}</strong>
                        <span className="hx-badge">{group.rows.length} 行</span>
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="hx-matrix-row-cell">
                          <div className="hx-cell-clip" title={row.label}>
                            {row.label}
                          </div>
                          <div className="hx-hint hx-cell-clip" title={row.sub}>
                            {row.sub}
                          </div>
                        </td>
                        {columns.columns.map((entry) => renderCell(row, entry))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hx-table-foot">
            <span className="hx-hint">
              显示 {rows.length} 行 × {columns.columns.length} 列
              {view === 'default'
                ? '（默认 12 + CORS）'
                : `（${matrixViewLabel(view)} + CORS）`}
            </span>
            <span className="hx-spacer" />
            <span className="hx-hint" style={{ fontSize: 11 }}>
              点单元格记录四态；勾选多格可批量设 N-A；CORS 列固定 N-A · CORS不挖，不可修改
            </span>
          </div>
        </div>
      </>
    );
  };

  const renderWorkTab = (): JSX.Element => {
    if (rows.length === 0) {
      return (
        <div className="hx-empty hx-empty-tall">
          <Icon name="matrix" size={24} />
          <div>先去接口清单录接口，再来看分工待办。</div>
        </div>
      );
    }
    return (
      <>
        <div className="hx-work-grid">
          {EXEC_MODE_ORDER.map((mode) => (
            <section className="hx-work-col" key={mode}>
              <div className="hx-work-col-head">
                <span className={`hx-badge ${EXEC_MODE_META[mode].badge}`}>
                  {EXEC_MODE_META[mode].label}
                </span>
                <span className="hx-hint">{todos[mode].length} 项待办</span>
              </div>
              <div className="hx-work-list">
                {todos[mode].length === 0 ? (
                  <div className="hx-hint" style={{ padding: 8 }}>
                    该分工下没有未测项
                  </div>
                ) : (
                  todos[mode].map((item, index) => (
                    <div
                      className="hx-todo-card"
                      key={`${item.row.key}-${item.entry.id}-${index}`}
                    >
                      <div className="hx-mono hx-hint">
                        {item.entry.id} · {item.row.label}
                      </div>
                      <div style={{ color: 'var(--strong)' }}>{item.entry.name}</div>
                      <div className="hx-hint">最低探针：{item.entry.minProbe}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
        <div className="hx-hint" style={{ marginTop: 8 }}>
          仅展示待办，不产生任何导出内容；禁用列不计入。
        </div>
      </>
    );
  };

  const renderCoverageTab = (): JSX.Element => {
    return (
      <section className={`hx-coverage${coverage.bias ? ' biased' : ''}`}>
        {coverage.bias ? (
          <div className="hx-bias">
            <Icon name="alert" size={13} />
            F-07 偏科提示：AI 覆盖率领先人工超过 40 个百分点，优先补人工验证项。
          </div>
        ) : null}

        <div className="hx-coverage-grid">
          <div className="hx-card-flat">
            <h3 className="hx-card-title">按 A~F 六大类</h3>
            {coverage.byCategory.map(renderBar)}
          </div>
          <div className="hx-card-flat">
            <h3 className="hx-card-title">按分工</h3>
            {coverage.byMode.map(renderBar)}
            <div className="hx-hint" style={{ marginTop: 8 }}>
              覆盖率 = 已有测试记录且状态为 打穿 / 证伪 / N-A 的格子数 ÷（行数 × 该组列数）；
              disabled 不计入分母；分母为 0 显示 0% 且不触发偏科。
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="hx-empty" style={{ marginTop: 12 }}>
            先去接口清单录接口，覆盖率才会有分母。
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <div className="hx-content-inner">
      <div className="hx-page-head">
        <div>
          <h1 className="hx-page-title">测试矩阵</h1>
          <div className="hx-crumb">
            项目 {projectId} · {rows.length} 行 · {tests.length} 条测试记录
          </div>
        </div>
        <div className="hx-spacer" />
      </div>

      <div className="hx-stat-row">
        <div className="hx-stat">
          <div className="hx-stat-label">矩阵行数</div>
          <div className="hx-stat-value">{rows.length}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">默认列</div>
          <div className="hx-stat-value">
            12<em> + CORS</em>
          </div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">已结论格</div>
          <div className="hx-stat-value">{doneCount}</div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label">N-A</div>
          <div className="hx-stat-value">{naCount}</div>
        </div>
      </div>

      <div className="hx-tabs">
        <button
          type="button"
          className={`hx-btn hx-btn-sm${tab === 'all' ? ' hx-btn-primary' : ''}`}
          onClick={() => setTab('all')}
        >
          全部
        </button>
        <button
          type="button"
          className={`hx-btn hx-btn-sm${tab === 'work' ? ' hx-btn-primary' : ''}`}
          onClick={() => setTab('work')}
        >
          分工视图
        </button>
        <button
          type="button"
          className={`hx-btn hx-btn-sm${tab === 'coverage' ? ' hx-btn-primary' : ''}`}
          onClick={() => setTab('coverage')}
        >
          覆盖统计
        </button>
      </div>

      {tab === 'all' ? renderAllTab() : null}
      {tab === 'work' ? renderWorkTab() : null}
      {tab === 'coverage' ? renderCoverageTab() : null}

      <CellEditor
        open={editor !== null}
        projectId={projectId}
        row={editor?.row ?? null}
        entry={editor?.entry ?? null}
        record={editor?.record ?? null}
        onClose={() => setEditor(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}
