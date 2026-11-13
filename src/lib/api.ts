/**
 * fetch 封装 + 类型化 API 调用。
 *
 * 非 2xx 一律抛 `ApiError`（带 code / message / status），页面直接用 toast 展示 `error.message`。
 */

import type {
  ActivatePayload,
  AiSchema,
  ApiResponse,
  Asset,
  BackupResult,
  BatchAccessInput,
  CreateAssetInput,
  CreateEndpointInput,
  CreateProjectInput,
  CreateSeedInput,
  DeleteAssetPayload,
  Endpoint,
  EndpointImportFormat,
  EndpointImportResult,
  FingerprintLibraryPayload,
  HealthPayload,
  ManualEdge,
  ProjectData,
  ProjectListPayload,
  ProjectSummary,
  RelationType,
  ReportFile,
  ReportFileView,
  Seed,
  SeedListPayload,
  SeedPriority,
  SeedStatus,
  TestBatchInput,
  TestBatchResult,
  TestCellInput,
  TestRecord,
  UpdateAssetInput,
  UpdateEndpointInput,
  UpdateProjectInput,
  UpdateSeedInput,
  UpdateTestInput,
  VulnCatalogPayload,
} from '../../shared/types';

const BASE = '/api';

export class ApiError extends Error {
  readonly code: string;

  readonly status: number;

  readonly details?: unknown;

  constructor(code: string, message: string, status = 0, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      '连不上本地后端（127.0.0.1:3001）。请确认 npm run dev 的后端进程还在运行。',
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok || !isApiResponse<T>(parsed) || parsed.ok === false) {
    const error =
      isApiResponse<T>(parsed) && parsed.ok === false ? parsed.error : undefined;
    throw new ApiError(
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? `请求失败（HTTP ${response.status}）`,
      response.status,
      error?.details,
    );
  }

  return parsed.data;
}

export const api = {
  health(): Promise<HealthPayload> {
    return request<HealthPayload>('/health');
  },

  /** 机器可读的 API 结构（只含字段说明，不含项目数据） */
  aiSchema(): Promise<AiSchema> {
    return request<AiSchema>('/ai-schema');
  },

  listProjects(): Promise<ProjectListPayload> {
    return request<ProjectListPayload>('/projects');
  },

  createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    return request<ProjectSummary>('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getProject(projectId: string): Promise<ProjectData> {
    return request<ProjectData>(`/projects/${encodeURIComponent(projectId)}`);
  },

  updateProject(projectId: string, patch: UpdateProjectInput): Promise<ProjectSummary> {
    return request<ProjectSummary>(`/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteProject(projectId: string): Promise<ActivatePayload> {
    return request<ActivatePayload>(`/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
  },

  activateProject(projectId: string): Promise<ActivatePayload> {
    return request<ActivatePayload>(
      `/projects/${encodeURIComponent(projectId)}/activate`,
      { method: 'PUT' },
    );
  },

  /* ------------------------------ 字典 ------------------------------ */

  listFingerprints(): Promise<FingerprintLibraryPayload> {
    return request<FingerprintLibraryPayload>('/fingerprints');
  },

  listVulnCatalog(): Promise<VulnCatalogPayload> {
    return request<VulnCatalogPayload>('/vuln-catalog');
  },

  /* ------------------------------ 资产 ------------------------------ */

  listAssets(projectId: string): Promise<Asset[]> {
    return request<Asset[]>(`/projects/${encodeURIComponent(projectId)}/assets`);
  },

  createAsset(projectId: string, input: CreateAssetInput): Promise<Asset> {
    return request<Asset>(`/projects/${encodeURIComponent(projectId)}/assets`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateAsset(projectId: string, assetId: string, patch: UpdateAssetInput): Promise<Asset> {
    return request<Asset>(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
  },

  deleteAsset(projectId: string, assetId: string): Promise<DeleteAssetPayload> {
    return request<DeleteAssetPayload>(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' },
    );
  },

  /* ---------------------------- 接口清单 ---------------------------- */

  listEndpoints(projectId: string, assetId?: string): Promise<Endpoint[]> {
    const query = assetId ? `?assetId=${encodeURIComponent(assetId)}` : '';
    return request<Endpoint[]>(
      `/projects/${encodeURIComponent(projectId)}/endpoints${query}`,
    );
  },

  createEndpoint(projectId: string, input: CreateEndpointInput): Promise<Endpoint> {
    return request<Endpoint>(`/projects/${encodeURIComponent(projectId)}/endpoints`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateEndpoint(
    projectId: string,
    endpointId: string,
    patch: UpdateEndpointInput,
  ): Promise<Endpoint> {
    return request<Endpoint>(
      `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
  },

  deleteEndpoint(projectId: string, endpointId: string): Promise<{ id: string }> {
    return request<{ id: string }>(
      `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`,
      { method: 'DELETE' },
    );
  },

  previewEndpointImport(
    projectId: string,
    input: { assetId: string; format: EndpointImportFormat; text: string },
  ): Promise<EndpointImportResult> {
    return request<EndpointImportResult>(
      `/projects/${encodeURIComponent(projectId)}/endpoints/import`,
      { method: 'POST', body: JSON.stringify({ ...input, dryRun: true }) },
    );
  },

  commitEndpointImport(
    projectId: string,
    input: { assetId: string; format: EndpointImportFormat; text: string },
  ): Promise<EndpointImportResult> {
    return request<EndpointImportResult>(
      `/projects/${encodeURIComponent(projectId)}/endpoints/import`,
      { method: 'POST', body: JSON.stringify({ ...input, dryRun: false }) },
    );
  },

  batchSetAccessState(
    projectId: string,
    input: BatchAccessInput,
  ): Promise<{ updated: number }> {
    return request<{ updated: number }>(
      `/projects/${encodeURIComponent(projectId)}/endpoints/batch-access`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  /* ---------------------------- 测试矩阵 ---------------------------- */

  listTests(
    projectId: string,
    filters: { endpointId?: string; assetId?: string; vulnType?: string } = {},
  ): Promise<TestRecord[]> {
    const params = new URLSearchParams();
    if (filters.endpointId) params.set('endpointId', filters.endpointId);
    if (filters.assetId) params.set('assetId', filters.assetId);
    if (filters.vulnType) params.set('vulnType', filters.vulnType);
    const query = params.toString();
    return request<TestRecord[]>(
      `/projects/${encodeURIComponent(projectId)}/tests${query ? `?${query}` : ''}`,
    );
  },

  setTestCell(projectId: string, input: TestCellInput): Promise<TestRecord> {
    return request<TestRecord>(`/projects/${encodeURIComponent(projectId)}/tests`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  batchSetTestCells(projectId: string, input: TestBatchInput): Promise<TestBatchResult> {
    return request<TestBatchResult>(`/projects/${encodeURIComponent(projectId)}/tests/batch`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateTestRecord(
    projectId: string,
    testId: string,
    patch: UpdateTestInput,
  ): Promise<TestRecord> {
    return request<TestRecord>(
      `/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(testId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
  },

  deleteTestRecord(projectId: string, testId: string): Promise<{ id: string }> {
    return request<{ id: string }>(
      `/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(testId)}`,
      { method: 'DELETE' },
    );
  },

  /* ---------------------------- 种子队列 ---------------------------- */

  listSeeds(
    projectId: string,
    filters: { type?: SeedPriority; status?: SeedStatus } = {},
  ): Promise<SeedListPayload> {
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);
    const query = params.toString();
    return request<SeedListPayload>(
      `/projects/${encodeURIComponent(projectId)}/seeds${query ? `?${query}` : ''}`,
    );
  },

  createSeed(projectId: string, input: CreateSeedInput): Promise<Seed> {
    return request<Seed>(`/projects/${encodeURIComponent(projectId)}/seeds`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateSeed(projectId: string, seedId: string, patch: UpdateSeedInput): Promise<Seed> {
    return request<Seed>(
      `/projects/${encodeURIComponent(projectId)}/seeds/${encodeURIComponent(seedId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
  },

  setSeedStatus(projectId: string, seedId: string, status: SeedStatus): Promise<Seed> {
    return request<Seed>(
      `/projects/${encodeURIComponent(projectId)}/seeds/${encodeURIComponent(seedId)}/status`,
      { method: 'POST', body: JSON.stringify({ status }) },
    );
  },

  deleteSeed(projectId: string, seedId: string): Promise<{ id: string }> {
    return request<{ id: string }>(
      `/projects/${encodeURIComponent(projectId)}/seeds/${encodeURIComponent(seedId)}`,
      { method: 'DELETE' },
    );
  },

  /* ---------------------------- 报告 / 设置 ---------------------------- */

  listReportFiles(projectId: string): Promise<ReportFileView[]> {
    return request<ReportFileView[]>(
      `/projects/${encodeURIComponent(projectId)}/reports`,
    );
  },

  createReportFile(projectId: string, name: string): Promise<ReportFile> {
    return request<ReportFile>('/reports', {
      method: 'POST',
      body: JSON.stringify({ projectId, name }),
    });
  },

  openReportFile(reportId: string): Promise<{ opened: true }> {
    return request<{ opened: true }>(
      `/reports/${encodeURIComponent(reportId)}/open`,
      { method: 'POST' },
    );
  },

  deleteReportFile(
    reportId: string,
    deleteFile = false,
  ): Promise<{ removed: true; fileDeleted: boolean }> {
    const query = deleteFile ? '?deleteFile=1' : '';
    return request<{ removed: true; fileDeleted: boolean }>(
      `/reports/${encodeURIComponent(reportId)}${query}`,
      { method: 'DELETE' },
    );
  },

  importProject(projectId: string, data: ProjectData): Promise<ProjectData> {
    return request<ProjectData>(`/projects/${encodeURIComponent(projectId)}/import`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
  },

  backupProject(projectId: string): Promise<BackupResult> {
    return request<BackupResult>(`/projects/${encodeURIComponent(projectId)}/backup`, {
      method: 'POST',
    });
  },

  /* ------------------------------ 图谱 ------------------------------ */

  saveGraphPositions(
    projectId: string,
    positions: { nodeId: string; x: number; y: number }[],
  ): Promise<{ updated: number }> {
    return request<{ updated: number }>(
      `/projects/${encodeURIComponent(projectId)}/graph/positions`,
      { method: 'PUT', body: JSON.stringify({ positions }) },
    );
  },

  createManualEdge(
    projectId: string,
    input: { source: string; target: string; relation: RelationType; note?: string },
  ): Promise<ManualEdge> {
    return request<ManualEdge>(`/projects/${encodeURIComponent(projectId)}/graph/edges`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateManualEdge(
    projectId: string,
    edgeId: string,
    patch: { relation?: RelationType; note?: string },
  ): Promise<ManualEdge> {
    return request<ManualEdge>(
      `/projects/${encodeURIComponent(projectId)}/graph/edges/${encodeURIComponent(edgeId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
  },

  deleteManualEdge(projectId: string, edgeId: string): Promise<{ id: string }> {
    return request<{ id: string }>(
      `/projects/${encodeURIComponent(projectId)}/graph/edges/${encodeURIComponent(edgeId)}`,
      { method: 'DELETE' },
    );
  },
};

/** 把任意异常转成可直接展示的中文文案 */
export function toErrorText(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
