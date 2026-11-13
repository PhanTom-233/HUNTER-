/**
 * 前后端共用实体类型定义。
 *
 * 约定：
 * - 所有时间字段都是 ISO 8601 字符串（`new Date().toISOString()`）。
 * - 所有 id 都是字符串，空关联用 `null`，不要用 undefined（便于 JSON 序列化稳定）。
 * - 本轮（第 1 块）只用到 `Project` / `ProjectSummary` / `ProjectIndex` / `ProjectData`，
 *   其余类型是后续交付的契约，先定义好，避免后面改结构返工。
 */

/* ------------------------------------------------------------------ */
/* 项目                                                                */
/* ------------------------------------------------------------------ */

/** lock = 锁面（只打授权面，不主动出圈）；free = 自由跳（启用种子队列 / 纯文本查询方向） */
export type ProjectMode = 'lock' | 'free';

export type ProjectStatus = 'active' | 'paused' | 'archived';

export interface Project {
  /** `p_` + 8 位随机串 */
  id: string;
  /** 例：某集团_SRC挖洞 */
  name: string;
  /** 目标名称，用户第一步填的那个 */
  targetName: string;
  mode: ProjectMode;
  /** 授权范围说明 / SRC 页面链接 */
  scopeNote: string;
  /** SRC 项目地址，可空 */
  srcUrl: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

/** 项目索引里保存的轻量摘要 */
export type ProjectSummary = Pick<
  Project,
  'id' | 'name' | 'targetName' | 'mode' | 'status' | 'createdAt' | 'updatedAt'
>;

/** `data/index.json` 的结构 */
export interface ProjectIndex {
  version: 1;
  activeProjectId: string | null;
  projects: ProjectSummary[];
}

/* ------------------------------------------------------------------ */
/* 种子（仅 free 模式）                                                */
/* ------------------------------------------------------------------ */

/** P0 点名业务&SRC公布域 / P1 企查查&证书常见 / P2 大批备案长尾 */
export type SeedPriority = 'P0' | 'P1' | 'P2';

export type SeedStatus = 'pending' | 'doing' | 'done' | 'cold';

export type SeedSource =
  | '用户原词'
  | '业务名/子品牌'
  | '全资子公司(1-4级)'
  | 'SRC范围页'
  | '备案/根域'
  | '回灌R';

/** P2 必须先活筛（DNS + HTTP + crt.sh） */
export type SeedAliveFilter = '未筛' | '通过' | 'cold';

export interface Seed {
  id: string;
  projectId: string;
  /** 种子：业务名 / 品牌 / 根域 / 备案主域 */
  keyword: string;
  type: SeedPriority;
  status: SeedStatus;
  source: SeedSource;
  /** 回灌来源 host，可空 */
  parentHost: string | null;
  /** 该种子搜出的资产条数 */
  poolSize: number;
  aliveFilter: SeedAliveFilter;
  /** 破闸新增：当前 doing 种子还有未完成资产时新增 pending，会在 UI 上打红标 */
  gateBroken: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSeedInput {
  keyword: string;
  type: SeedPriority;
  source: SeedSource;
  status?: SeedStatus;
  aliveFilter?: SeedAliveFilter;
  poolSize?: number;
  parentHost?: string | null;
  note?: string;
}

export type UpdateSeedInput = Partial<CreateSeedInput>;

/** 种子页一次拿全的快照 */
export interface SeedListPayload {
  items: Seed[];
  doing: Seed | null;
  unfinishedAssets: Asset[];
  breakLogs: BreakLog[];
  counts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* 技术栈指纹                                                          */
/* ------------------------------------------------------------------ */

/** 16 个分栏的 key（顺序即 UI 显示顺序，见 3.10） */
export type FpCategoryKey =
  | 'webServer'
  | 'language'
  | 'webFramework'
  | 'jsFramework'
  | 'jsLibrary'
  | 'buildTool'
  | 'middleware'
  | 'cms'
  | 'auth'
  | 'gateway'
  | 'dbOrm'
  | 'cloud'
  | 'waf'
  | 'devops'
  | 'container'
  | 'mobile';

export type FingerprintConfidence = '确认' | '疑似';

/** 单条指纹条目（16 栏里的一格） */
export interface FpItem {
  id: string;
  name: string;
  /** 版本号，如 2.3.4 / 8.5.51 / 未知 */
  version: string;
  /** 判定依据原文，如 "Server: nginx/1.18.0" */
  evidence: string;
  confidence: FingerprintConfidence;
}

/** 资产侧的结构化技术栈（16 栏，每栏可多条） */
export type AssetFingerprints = Record<FpCategoryKey, FpItem[]>;

/** 全局指纹库条目 */
export interface Fingerprint {
  id: string;
  name: string;
  category: FpCategoryKey;
  version: string;
  evidence: string;
  confidence: FingerprintConfidence;
  /** 由 category + name 推导出的攻击面 */
  attackSurface: string[];
  kbModules: string[];
  knownVulns: VulnRef[];
}

export type VulnSource = 'CVE' | 'CNVD' | '厂商通告' | '经验';

export type VulnSeverity = '严重' | '高危' | '中危';

export type VulnRefStatus = '待验证' | '已验证' | '不适用';

/** 历史漏洞（挂在指纹上，资产侧带出后有自己的状态） */
export interface VulnRef {
  id: string;
  fingerprintId: string;
  name: string;
  source: VulnSource;
  /** CVE-2022-22947 等 */
  identifier: string;
  affectedVersion: string;
  severity: VulnSeverity;
  /** 利用条件 */
  condition: string;
  /** 验证方向：打哪个 path / 什么现象算成功 */
  verifyPath: string;
  kbModule: string;
  status: VulnRefStatus;
}

/* ------------------------------------------------------------------ */
/* 资产                                                                */
/* ------------------------------------------------------------------ */

export type AssetCategory =
  | 'big_system'
  | 'single_page'
  | 'api_service'
  | 'admin_console'
  | 'middleware'
  | 'mobile_h5'
  | 'static_shell';

/** 肥面 / 瘦壳 */
export type AssetWeight = 'fat' | 'thin';

export type AssetOwnership = '全资' | '参股' | '未知' | '非范围';

export type AliveStatus =
  | '存活'
  | '401'
  | '403'
  | '登录墙'
  | '停放页'
  | '超时'
  | '死链'
  | '未探活';

/** §4.0「说清这摊」四字段：谁在用 / 核心对象 / 钱权状态落在哪 / 没登录能碰到哪层 */
export interface AssetBrief {
  user: string;
  objects: string;
  money: string;
  preAuth: string;
}

/** §4.3「本轮完成」11 项清单的 key */
export type ChecklistKey =
  | 'briefDone'
  | 'endpointsBuilt'
  | 'matrixProbed'
  | 'paramMatrix'
  | 'vulnsLogged'
  | 'noSameSkinWaste'
  | 'loginBizSurface'
  | 'sameGate'
  | 'authGates'
  | 'mediumEscalated'
  | 'fatThinSplit';

export type AssetChecklist = Record<ChecklistKey, boolean>;

export interface Asset {
  id: string;
  projectId: string;
  seedId: string | null;
  /** 资产名/系统名，用户自填 */
  name: string;
  url: string;
  host: string;
  ip: string;
  port: number | null;
  protocol: string;
  /** 页面标题 */
  title: string;
  category: AssetCategory;
  weight: AssetWeight;
  /** 指纹标签（扁平，用于列表展示 / 搜索） */
  fingerprints: string[];
  /** 16 栏结构化技术栈 */
  fp: AssetFingerprints;
  ownership: AssetOwnership;
  aliveStatus: AliveStatus;
  /** 同皮组标识，同皮资产只做 2-3 个代表 */
  sameSkinGroup: string;
  brief: AssetBrief;
  /** 指纹推导出的攻击面清单 */
  attackSurface: string[];
  /** 指纹带出的历史漏洞（资产侧状态） */
  vulnRefs: VulnRef[];
  /** 是否已过「本轮完成」§4.3 */
  covered: boolean;
  coveredAt: string | null;
  checklist: AssetChecklist;
  riskNote: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* 接口                                                                */
/* ------------------------------------------------------------------ */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '*';

export type ParamLocation = 'query' | 'body' | 'header' | 'path';

export interface Param {
  name: string;
  in: ParamLocation;
  type: string;
  /** 业务字段（吃 id / 金额 / 状态）优先测 */
  isBusiness: boolean;
}

export type EndpointSource = 'JS提取' | '抓包' | 'Swagger' | '回包线索' | '字典' | '文档';

/** 「接口是否可以访问」是本程序的核心状态列，语义严格区分 */
export type AccessState =
  | '匿名可访问-有业务字段'
  | '匿名可访问-无业务字段'
  | '需登录'
  | '401'
  | '403'
  | '404'
  | '超时'
  | '未测试';

export type RespSignature = '有业务JSON' | '空列表' | '仅登录码' | '报错500' | '超时' | '静态HTML';

export interface Endpoint {
  id: string;
  projectId: string;
  assetId: string;
  /** 功能点（可选层，默认关闭），为空时直接挂在资产下 */
  featureId: string | null;
  method: HttpMethod;
  /** 完整路径，允许只写 /api/xxx */
  path: string;
  /** 可空，留空时用 asset.url + path 拼 */
  fullUrl: string;
  source: EndpointSource;
  params: Param[];
  accessState: AccessState;
  respSignature: RespSignature;
  /** 是否有差分面（有 total/条数/回显/会拉 URL 即为 true） */
  diffSurface: boolean;
  /** 从 JS 抄到的钥匙：签名盐 / 硬编码 key / 演示号 / 密文 id+公钥 */
  keys: string[];
  note: string;
  createdAt: string;
}

/** 新增 / 编辑接口的入参（不改 Endpoint 本体结构） */
export interface CreateEndpointInput {
  assetId: string;
  featureId?: string | null;
  method: HttpMethod;
  path: string;
  fullUrl?: string;
  source: EndpointSource;
  params?: Param[];
  accessState?: AccessState;
  respSignature?: RespSignature;
  diffSurface?: boolean;
  keys?: string[];
  note?: string;
}

export type UpdateEndpointInput = Partial<CreateEndpointInput>;

/** 批量导入格式 */
export type EndpointImportFormat = 'path' | 'curl' | 'swagger';

/** 导入预览 / 提交的单条草稿（与 Endpoint 同结构，但没有服务端字段） */
export interface EndpointImportDraft {
  assetId: string;
  featureId: string | null;
  method: HttpMethod;
  path: string;
  fullUrl: string;
  source: EndpointSource;
  params: Param[];
  accessState: AccessState;
  respSignature: RespSignature;
  diffSurface: boolean;
  keys: string[];
  note: string;
}

export interface EndpointImportError {
  line: number;
  reason: string;
}

export interface EndpointImportResult {
  format: EndpointImportFormat;
  /** 成功解析的条数（dryRun=false 时也是实际写入的条数） */
  successCount: number;
  /** 跳过的行数 */
  skipped: number;
  errors: EndpointImportError[];
  /** 预览用：解析出来的草稿；提交后返回实际落库的 Endpoint[] */
  drafts: EndpointImportDraft[];
  created: Endpoint[];
}

export interface BatchAccessInput {
  ids: string[];
  accessState: AccessState;
}

/* ------------------------------------------------------------------ */
/* 测试记录（矩阵单元格）                                              */
/* ------------------------------------------------------------------ */

export type TestState = '未测' | '打穿' | '证伪' | 'N-A';

/** N-A 必须选原因，不能自由填 */
export type NaReason =
  | '无该入口'
  | '回码仅为登录闸'
  | '纯静态页'
  | '无写接口'
  | '无URL类参数'
  | '无回显与写入点'
  | '无执行类Sink'
  | 'CORS不挖'
  | '降级无法测';

export type ExecMode = 'ai' | 'manual' | 'hybrid';

export interface TestRecord {
  id: string;
  projectId: string;
  /** 接口级优先，资产级兜底 */
  endpointId: string | null;
  assetId: string;
  /** 引用漏洞清单 ID，如 AUTH-02、INJ-01 */
  vulnType: string;
  state: TestState;
  /** 仅 N-A 时必填 */
  naReason: NaReason | null;
  payload: string;
  baseline: string;
  /** 回包片段 */
  evidence: string;
  /** 关联的历史漏洞 */
  vulnRefId: string | null;
  createdAt: string;
}

/** 设置一个矩阵单元格的入参（不改 TestRecord 本体结构） */
export interface TestCellInput {
  assetId: string;
  /** 有接口时填接口 id；资产级行留 null */
  endpointId?: string | null;
  vulnType: string;
  state: TestState;
  naReason?: NaReason | null;
  payload?: string;
  baseline?: string;
  evidence?: string;
  vulnRefId?: string | null;
}

export type UpdateTestInput = Partial<TestCellInput>;

export interface TestBatchInput {
  cells: TestCellInput[];
}

export interface TestBatchResult {
  updated: number;
  created: number;
  records: TestRecord[];
}

/* ------------------------------------------------------------------ */
/* 报告                                                                */
/* ------------------------------------------------------------------ */

export type ReportStatus = '草稿' | '已确认' | '已提交';

/** 报告等级与漏洞等级同一套取值 */
export type ReportSeverity = VulnSeverity;

/** 报告门禁：匿名闸 / 认钥闸 */
export interface ReportGates {
  /** 确认这包没有 Cookie */
  anonymous: boolean;
  /** 认钥闸：假值对照 + 带出身份/列表 */
  keyGate: boolean;
  fakeValueTest: boolean;
  broughtIdentity: boolean;
}

export interface Report {
  id: string;
  projectId: string;
  assetId: string;
  endpointId: string | null;
  /** = 文件名 */
  title: string;
  targetUrl: string;
  severity: VulnSeverity;
  /** 漏洞描述（第一人称大白话） */
  description: string;
  /** 漏洞危害，每种伤害一行 */
  impact: string;
  /** 涉及接口清单，带出处 */
  endpoints: string[];
  /** 复现步骤，含整包 */
  steps: string;
  fix: string;
  gates: ReportGates;
  status: ReportStatus;
  createdAt: string;
}

/** 项目 JSON 里只存 docx 文件名，不存正文与绝对路径 */
export interface ReportFile {
  id: string;
  name: string;
  fileName: string;
  createdAt: string;
}

/** 报告文件列表项：size 由服务端 stat 得到；文件缺失时 missing=true */
export interface ReportFileView extends ReportFile {
  size: number | null;
  missing: boolean;
}

export interface BackupResult {
  /** 相对 data/ 的备份路径，例如 data/backup/<id>-manual-<stamp>.json */
  file: string;
}

/* ------------------------------------------------------------------ */
/* 资产图谱                                                            */
/* ------------------------------------------------------------------ */

export type GraphNodeKind = 'root' | 'domain' | 'host' | 'site' | 'mw' | 'feature' | 'api' | 'vuln';

/** 手动边类型：写死 7 种，禁止自由文本（用户新增的类型必须落库） */
export type RelationType =
  | '同 /24'
  | '同 C 段'
  | '同证书'
  | '同 favicon'
  | '同模板'
  | '互调'
  | '引用(JS→密钥)';

/** 横向关联边：只由用户手画，程序不推断 */
export interface ManualEdge {
  id: string;
  projectId: string;
  /** nodeId，如 site:12 / api:204 */
  source: string;
  target: string;
  relation: RelationType;
  note: string;
  createdAt: string;
}

export interface GraphPosition {
  projectId: string;
  nodeId: string;
  x: number;
  y: number;
  pinned: boolean;
}

/* ------------------------------------------------------------------ */
/* 功能点（可选层，默认关闭）                                          */
/* ------------------------------------------------------------------ */

export interface Feature {
  id: string;
  projectId: string;
  assetId: string;
  /** 登录、订单、钱包、后台管理、文件中心 */
  name: string;
  /** 支付、上传、导出、鉴权、搜索、导入 */
  riskTags: string[];
  note: string;
  order: number;
}

/* ------------------------------------------------------------------ */
/* 活动时间线 / 破闸日志                                               */
/* ------------------------------------------------------------------ */

export type ActivityKind =
  | 'project'
  | 'seed'
  | 'asset'
  | 'endpoint'
  | 'test'
  | 'report'
  | 'graph'
  | 'system';

export interface Activity {
  id: string;
  projectId: string;
  at: string;
  kind: ActivityKind;
  summary: string;
  detail: string;
}

/** 破闸日志：doing 种子还有未完成资产时新增 pending 种子会记一条 */
export interface BreakLog {
  id: string;
  projectId: string;
  at: string;
  /** 当前正在做的种子 */
  doingSeedId: string | null;
  /** 新加的 pending 种子 */
  pendingSeedId: string;
  unfinishedAssetIds: string[];
  note: string;
}

/* ------------------------------------------------------------------ */
/* 单项目全量数据（`data/<projectId>.json`）                            */
/* ------------------------------------------------------------------ */

export interface ProjectData {
  project: Project;
  seeds: Seed[];
  assets: Asset[];
  endpoints: Endpoint[];
  tests: TestRecord[];
  reports: Report[];
  /** docx 入口登记；正文不存 JSON */
  reportFiles: ReportFile[];
  manualEdges: ManualEdge[];
  graphPositions: GraphPosition[];
  features: Feature[];
  activity: Activity[];
  breakLogs: BreakLog[];
}

/* ------------------------------------------------------------------ */
/* API 响应                                                            */
/* ------------------------------------------------------------------ */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

/** GET /api/projects 的 data */
export interface ProjectListPayload {
  projects: ProjectSummary[];
  activeProjectId: string | null;
}

/** POST /api/projects 的请求体 */
export interface CreateProjectInput {
  name: string;
  targetName: string;
  mode?: ProjectMode;
  scopeNote?: string;
  srcUrl?: string;
}

/** PATCH /api/projects/:id 的请求体 */
export interface UpdateProjectInput {
  name?: string;
  targetName?: string;
  mode?: ProjectMode;
  scopeNote?: string;
  srcUrl?: string;
  status?: ProjectStatus;
}

/** PUT /api/projects/:id/activate 的 data */
export interface ActivatePayload {
  activeProjectId: string | null;
}

/** GET /api/health 的 data */
export interface HealthPayload {
  status: 'ok';
  version: string;
  time: string;
}

/* ------------------------------------------------------------------ */
/* 漏洞清单（内置字典，见方法论 3.11）                                 */
/* ------------------------------------------------------------------ */

/** A 认证与授权 / B 注入与执行 / C 客户端 / D 服务端与基础设施 / E 业务逻辑 / F 云与供应链 */
export type VulnCatalogCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/**
 * 测试分工。
 * `disabled` 只用于方法论层面固定不挖的列（CLD-07 CORS），矩阵里灰显锁死。
 */
export type VulnExecMode = 'ai' | 'manual' | 'hybrid' | 'disabled';

/** 报告等级提示；`不写` 表示缺头/无危害这类不单独交报告的条目 */
export type VulnSeverityHint = VulnSeverity | '不写';

/** 内置漏洞清单条目（3.11 表的落库形态） */
export interface VulnCatalogEntry {
  /** AUTH-01 / INJ-03 … */
  id: string;
  name: string;
  category: VulnCatalogCategory;
  /** 用户口语别名，搜索要同时命中 name / aliases / id */
  aliases: string[];
  /** 命中哪些指纹才需要测（指纹 name，空数组 = 通用） */
  requiredFingerprint: string[];
  /** 什么情况下该测这个 */
  triggerSignal: string;
  /** 最低探针（至少打这一枪） */
  minProbe: string;
  /** 什么算打穿 */
  passCondition: string;
  execMode: VulnExecMode;
  /** hybrid 时 AI 负责哪段；ai 条目也写清范围，manual 留空 */
  aiPart: string;
  /** hybrid 时人工负责哪段；manual 条目也写清范围，ai 留空 */
  manualPart: string;
  reportable: boolean;
  severityHint: VulnSeverityHint;
  kbModule: string;
}

/* ------------------------------------------------------------------ */
/* 指纹库 / 漏洞清单接口载荷                                           */
/* ------------------------------------------------------------------ */

/** 16 栏分类元数据（顺序即 UI 显示顺序） */
export interface FpCategoryMeta {
  key: FpCategoryKey;
  label: string;
  hint: string;
}

/** GET /api/fingerprints 的 data */
export interface FingerprintLibraryPayload {
  categories: FpCategoryMeta[];
  items: Fingerprint[];
}

/** GET /api/vuln-catalog 的 data */
export interface VulnCatalogPayload {
  items: VulnCatalogEntry[];
}

/* ------------------------------------------------------------------ */
/* 资产写入载荷                                                        */
/* ------------------------------------------------------------------ */

/**
 * POST /api/projects/:projectId/assets 的请求体。
 *
 * 派生字段（fingerprints / attackSurface / vulnRefs / covered / coveredAt）**不信任前端**，
 * 服务端会用 `deriveFromFp` 重新计算；这里保留是为了让 PATCH 能带上用户改过的 vulnRefs 状态。
 */
export interface CreateAssetInput {
  seedId?: string | null;
  name: string;
  url?: string;
  host?: string;
  ip?: string;
  port?: number | null;
  protocol?: string;
  title?: string;
  category?: AssetCategory;
  weight?: AssetWeight;
  ownership?: AssetOwnership;
  aliveStatus?: AliveStatus;
  sameSkinGroup?: string;
  brief?: Partial<AssetBrief>;
  riskNote?: string;
  /** 16 栏技术栈，缺的分栏补空数组 */
  fp?: Partial<Record<FpCategoryKey, Partial<FpItem>[]>>;
  /** 用户手改过的历史漏洞（含状态），同 id 的状态会被保留 */
  vulnRefs?: Partial<VulnRef>[];
  checklist?: Partial<AssetChecklist>;
  covered?: boolean;
}

/** PATCH /api/projects/:projectId/assets/:assetId 的请求体 */
export type UpdateAssetInput = Partial<CreateAssetInput>;

/** DELETE /api/projects/:projectId/assets/:assetId 的 data */
export interface DeleteAssetPayload {
  id: string;
}

/* ------------------------------------------------------------------ */
/* AI 读这里：机器可读的 API 结构（GET /api/ai-schema）                  */
/* ------------------------------------------------------------------ */

export type AiFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';

export interface AiSchemaField {
  name: string;
  /** 中文标签，对应页面表单项的文案，便于 AI 对照填写 */
  label: string;
  type: AiFieldType;
  required?: boolean;
  max?: number;
  min?: number;
  /** type = 'enum' 时的可选值，全部来自实际校验常量 */
  values?: string[];
  note?: string;
}

export interface AiSchemaEndpoint {
  group: string;
  method: string;
  path: string;
  summary: string;
  fields: AiSchemaField[];
  example?: Record<string, unknown>;
}

export interface AiSchema {
  app: string;
  version: number;
  baseUrl: string;
  hint: string;
  projectData: { method: string; path: string; note: string };
  endpoints: AiSchemaEndpoint[];
  enums: Record<string, string[]>;
}
