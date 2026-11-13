/**
 * 建议中心的项目快照。
 *
 * 只从 ProjectData 派生，不发请求、不读文件、不引用任何外部目录。
 * A/E 组依赖的 seeds 为空时正常返回空数组，规则层自行跳过。
 */

import type {
  Asset,
  BreakLog,
  Endpoint,
  Project,
  ProjectData,
  Report,
  ReportFile,
  Seed,
  TestRecord,
} from '../../shared/types';
import {
  allEnabledColumns,
  buildRows,
  buildTestMap,
  cellKey,
  coverageStats,
  isDone,
} from '../pages/matrix/matrixModel';
import type { CoverageStats, MatrixRow } from '../pages/matrix/matrixModel';

export interface CopilotContext {
  project: Project;
  assets: Asset[];
  endpoints: Endpoint[];
  tests: TestRecord[];
  reports: Report[];
  reportFiles: ReportFile[];
  seeds: Seed[];
  breakLogs: BreakLog[];
  rows: MatrixRow[];
  testsByCell: Map<string, TestRecord>;
  endpointsById: Map<string, Endpoint>;
  assetsById: Map<string, Asset>;
  /** 当前 doing 种子 / 其下未闭环活面 */
  doingSeed: Seed | null;
  doingUnfinishedAssets: Asset[];
  /** 每个种子的未闭环活面数 */
  seedUnfinishedCounts: Record<string, number>;
  lastActivityAt: string;
  matrixDoneCount: number;
  matrixTotal: number;
  /** 已完成态（打穿 / 证伪 / N-A）出现过的漏洞类型 */
  doneVulnTypes: Set<string>;
  coverage: CoverageStats;
  totalCells: number;
  doneCells: number;
}

export function buildCopilotContext(data: ProjectData): CopilotContext {
  const rows = buildRows(data.assets, data.endpoints);
  const testsByCell = buildTestMap(data.tests);
  const coverage = coverageStats(rows, data.tests);
  const enabledColumns = allEnabledColumns();

  let doneCells = 0;
  for (const row of rows) {
    for (const entry of enabledColumns) {
      const record = testsByCell.get(cellKey(row.endpointId, row.assetId, entry.id));
      if (record && isDone(record.state)) doneCells += 1;
    }
  }

  const aliveSurface: Asset['aliveStatus'][] = ['存活', '401', '403', '登录墙'];
  const isAliveSurface = (asset: Asset): boolean =>
    aliveSurface.includes(asset.aliveStatus);
  const seedUnfinishedCounts: Record<string, number> = {};
  for (const seed of data.seeds) {
    seedUnfinishedCounts[seed.id] = data.assets.filter(
      (asset) =>
        asset.seedId === seed.id && !asset.covered && isAliveSurface(asset),
    ).length;
  }
  const doingSeed = data.seeds.find((seed) => seed.status === 'doing') ?? null;
  const doingUnfinishedAssets = doingSeed
    ? data.assets.filter(
        (asset) =>
          asset.seedId === doingSeed.id && !asset.covered && isAliveSurface(asset),
      )
    : [];

  return {
    project: data.project,
    assets: data.assets,
    endpoints: data.endpoints,
    tests: data.tests,
    reports: data.reports,
    reportFiles: data.reportFiles,
    seeds: data.seeds,
    breakLogs: data.breakLogs,
    rows,
    testsByCell,
    endpointsById: new Map(data.endpoints.map((endpoint) => [endpoint.id, endpoint])),
    assetsById: new Map(data.assets.map((asset) => [asset.id, asset])),
    doingSeed,
    doingUnfinishedAssets,
    seedUnfinishedCounts,
    lastActivityAt: data.activity.reduce(
      (latest, item) => (item.at > latest ? item.at : latest),
      data.project.updatedAt,
    ),
    matrixDoneCount: doneCells,
    matrixTotal: rows.length * enabledColumns.length,
    doneVulnTypes: new Set(
      data.tests.filter((test) => isDone(test.state)).map((test) => test.vulnType),
    ),
    coverage,
    totalCells: rows.length * enabledColumns.length,
    doneCells,
  };
}
