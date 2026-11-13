/**
 * 测试矩阵的纯计算层：行 / 列 / 单元格状态 / 分工待办 / 覆盖统计。
 *
 * 不在这里发请求、不读文件、不引用任何外部知识库目录；数据全部来自入参。
 */

import { fpItems } from '../../../shared/fpDerive';
import { VULN_CATALOG, VULN_CATALOG_MAP } from '../../../shared/vulnCatalog';
import type {
  Asset,
  Endpoint,
  TestRecord,
  TestState,
  VulnCatalogCategory,
  VulnCatalogEntry,
  VulnExecMode,
} from '../../../shared/types';

export const DEFAULT_VULN_IDS: readonly string[] = [
  'AUTH-01',
  'AUTH-02',
  'AUTH-05',
  'INJ-01',
  'INJ-03',
  'SRV-02',
  'INJ-04',
  'SRV-01',
  'CLI-01',
  'BIZ-01',
  'CLD-01',
  'SRV-03',
];

/** 方法论固定不挖：矩阵里恒定作为最后一列灰显 */
export const CORS_VULN_ID = 'CLD-07';

export const DONE_STATES: readonly TestState[] = ['打穿', '证伪', 'N-A'];

export type ActiveExecMode = Exclude<VulnExecMode, 'disabled'>;

export const EXEC_MODE_ORDER: readonly ActiveExecMode[] = ['ai', 'manual', 'hybrid'];

export const CATEGORY_ORDER: readonly VulnCatalogCategory[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export const CATEGORY_LABELS: Record<VulnCatalogCategory, string> = {
  A: '认证与授权',
  B: '注入与执行',
  C: '客户端与云',
  D: '服务端与配置',
  E: '业务逻辑',
  F: '流程与收口',
};

export const EXEC_MODE_META: Record<VulnExecMode, { label: string; badge: string }> = {
  ai: { label: 'AI', badge: 'hx-badge-blue' },
  manual: { label: '人工', badge: 'hx-badge-orange' },
  hybrid: { label: '混合', badge: 'hx-badge-violet' },
  disabled: { label: '禁用', badge: 'hx-badge-dim' },
};

export interface MatrixRow {
  /** endpointId ?? assetId */
  key: string;
  assetId: string;
  endpointId: string | null;
  label: string;
  sub: string;
  asset: Asset;
  endpoint?: Endpoint;
}

export interface MatrixGroup {
  asset: Asset;
  rows: MatrixRow[];
}

export interface MatrixColumnGroup {
  key: string;
  label: string;
  columns: VulnCatalogEntry[];
}

export interface MatrixColumns {
  columns: VulnCatalogEntry[];
  groups: MatrixColumnGroup[];
}

export interface TodoItem {
  row: MatrixRow;
  entry: VulnCatalogEntry;
}

export interface CoverageBucket {
  key: string;
  label: string;
  done: number;
  total: number;
  percent: number;
}

export interface CoverageStats {
  byCategory: CoverageBucket[];
  byMode: CoverageBucket[];
  aiPercent: number;
  manualPercent: number;
  bias: boolean;
}

export function cellKey(endpointId: string | null, assetId: string, vulnType: string): string {
  return `${endpointId ?? assetId}::${vulnType}`;
}

function entryById(id: string): VulnCatalogEntry {
  const entry = VULN_CATALOG_MAP[id];
  if (!entry) throw new Error(`内置漏洞清单缺少 ${id}`);
  return entry;
}

function corsEntry(): VulnCatalogEntry {
  return entryById(CORS_VULN_ID);
}

/** 除固定禁用列以外的全部条目（分工视图 / 覆盖统计的分母用） */
export function allEnabledColumns(): VulnCatalogEntry[] {
  return VULN_CATALOG.filter((entry) => entry.execMode !== 'disabled');
}

export type MatrixView = 'default' | VulnCatalogCategory;

export function buildColumns(view: MatrixView): MatrixColumns {
  const cors = corsEntry();
  if (view === 'default') {
    const defaults = DEFAULT_VULN_IDS.map(entryById);
    return {
      columns: [...defaults, cors],
      groups: [
        { key: 'default', label: '默认 12 列', columns: defaults },
        { key: 'cors', label: '固定禁用', columns: [cors] },
      ],
    };
  }

  const categoryColumns = VULN_CATALOG.filter(
    (entry) =>
      entry.category === view &&
      entry.id !== CORS_VULN_ID &&
      entry.execMode !== 'disabled',
  );

  return {
    columns: [...categoryColumns, cors],
    groups: [
      {
        key: `category-${view}`,
        label: `${view} 类 · ${CATEGORY_LABELS[view]}`,
        columns: categoryColumns,
      },
      { key: 'cors', label: '固定禁用', columns: [cors] },
    ],
  };
}

export function buildRows(assets: Asset[], endpoints: Endpoint[]): MatrixRow[] {
  if (endpoints.length > 0) {
    const rows = endpoints
      .map((endpoint): MatrixRow | null => {
        const asset = assets.find((item) => item.id === endpoint.assetId);
        if (!asset) return null;
        return {
          key: endpoint.id,
          assetId: asset.id,
          endpointId: endpoint.id,
          label: endpoint.path || endpoint.fullUrl || '(未填路径)',
          sub: `${endpoint.method} · ${asset.name}`,
          asset,
          endpoint,
        };
      })
      .filter((row): row is MatrixRow => row !== null);
    if (rows.length > 0) return rows;
  }

  return assets.map((asset) => ({
    key: asset.id,
    assetId: asset.id,
    endpointId: null,
    label: asset.name,
    sub: '资产级行',
    asset,
  }));
}

export function groupRows(rows: MatrixRow[]): MatrixGroup[] {
  const groups = new Map<string, MatrixGroup>();
  for (const row of rows) {
    let group = groups.get(row.assetId);
    if (!group) {
      group = { asset: row.asset, rows: [] };
      groups.set(row.assetId, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

export function buildTestMap(tests: TestRecord[]): Map<string, TestRecord> {
  const map = new Map<string, TestRecord>();
  for (const test of tests) {
    map.set(cellKey(test.endpointId, test.assetId, test.vulnType), test);
  }
  return map;
}

export function stateOf(record: TestRecord | null | undefined): TestState {
  return record?.state ?? '未测';
}

export function isDone(state: TestState): boolean {
  return DONE_STATES.includes(state);
}

/** 「待测·有信号」：资产指纹名命中该列的 requiredFingerprint */
export function signalHits(row: MatrixRow, entry: VulnCatalogEntry): string[] {
  if (entry.requiredFingerprint.length === 0) return [];
  const names = new Set(
    fpItems(row.asset.fp)
      .map((item) => item.name.trim().toLowerCase())
      .filter(Boolean),
  );
  return entry.requiredFingerprint.filter((required) =>
    names.has(required.trim().toLowerCase()),
  );
}

export function buildTodos(
  rows: MatrixRow[],
  tests: TestRecord[],
): Record<ActiveExecMode, TodoItem[]> {
  const map = buildTestMap(tests);
  const result: Record<ActiveExecMode, TodoItem[]> = {
    ai: [],
    manual: [],
    hybrid: [],
  };
  const columns = allEnabledColumns();

  for (const row of rows) {
    for (const entry of columns) {
      if (entry.execMode === 'disabled') continue;
      const state = stateOf(map.get(cellKey(row.endpointId, row.assetId, entry.id)));
      if (state === '未测') {
        result[entry.execMode].push({ row, entry });
      }
    }
  }
  return result;
}

export function coverageStats(rows: MatrixRow[], tests: TestRecord[]): CoverageStats {
  const map = buildTestMap(tests);
  const enabled = allEnabledColumns();

  const doneIn = (columns: VulnCatalogEntry[]): number => {
    let done = 0;
    for (const row of rows) {
      for (const entry of columns) {
        const record = map.get(cellKey(row.endpointId, row.assetId, entry.id));
        if (record && isDone(record.state)) done += 1;
      }
    }
    return done;
  };

  const bucket = (key: string, label: string, columns: VulnCatalogEntry[]): CoverageBucket => {
    const total = rows.length * columns.length;
    const done = doneIn(columns);
    return {
      key,
      label,
      done,
      total,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  };

  const byCategory = CATEGORY_ORDER.map((category) =>
    bucket(
      category,
      `${category} 类 · ${CATEGORY_LABELS[category]}`,
      enabled.filter((entry) => entry.category === category),
    ),
  );
  const byMode = EXEC_MODE_ORDER.map((mode) =>
    bucket(mode, EXEC_MODE_META[mode].label, enabled.filter((entry) => entry.execMode === mode)),
  );

  const ai = byMode.find((item) => item.key === 'ai');
  const manual = byMode.find((item) => item.key === 'manual');
  const aiPercent = ai?.percent ?? 0;
  const manualPercent = manual?.percent ?? 0;
  const bias =
    (ai?.total ?? 0) > 0 &&
    (manual?.total ?? 0) > 0 &&
    aiPercent - manualPercent > 40;

  return { byCategory, byMode, aiPercent, manualPercent, bias };
}
