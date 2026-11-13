/**
 * 机器可读的 API 结构：`GET /api/ai-schema`。
 *
 * 只输出「有哪些写接口、每个字段叫什么 / 中文标签 / 类型 / 必填 / 上限 / 枚举值」，
 * 供外部 AI 直接读取后自动调用或对照页面表单填写；**不含任何项目数据**，无副作用。
 *
 * 枚举 values 一律 import 共享常量，禁止在这里手抄一份，避免与真实校验漂移。
 */

import {
  ACCESS_STATES,
  ALIVE_STATUSES,
  ASSET_CATEGORY_KEYS,
  ASSET_HOST_MAX,
  ASSET_NAME_MAX,
  ASSET_NOTE_MAX,
  ASSET_PROTOCOL_MAX,
  ASSET_SAME_SKIN_MAX,
  ASSET_TITLE_MAX,
  CHECKLIST_ITEMS,
  ENDPOINT_SOURCES,
  HTTP_METHODS,
  MODE_META,
  NA_REASONS,
  OWNERSHIPS,
  PARAM_LOCATIONS,
  PROJECT_NAME_MAX,
  PROJECT_STATUS_LABEL,
  RESP_SIGNATURES,
  SEED_ALIVE_FILTERS,
  SEED_SOURCES,
  SEED_STATUSES,
  SEED_TYPES,
  TARGET_NAME_MAX,
  TEST_STATES,
} from '../shared/constants';
import { VULN_CATALOG } from '../shared/vulnCatalog';
import type { AiSchema, AiSchemaEndpoint, AiSchemaField } from '../shared/types';

type FieldOpts = Omit<AiSchemaField, 'name' | 'label' | 'type'>;

const f = (
  name: string,
  label: string,
  type: AiSchemaField['type'],
  opts: FieldOpts = {},
): AiSchemaField => ({ name, label, type, ...opts });

const PROJECT_MODES = Object.keys(MODE_META);
const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_LABEL);
/** 可测的漏洞类型（disabled 的 CORS 固定列不参与填写） */
const VULN_IDS = VULN_CATALOG.filter((entry) => entry.execMode !== 'disabled').map(
  (entry) => entry.id,
);

const assetFields: AiSchemaField[] = [
  f('name', '资产名', 'string', { required: true, max: ASSET_NAME_MAX }),
  f('url', 'URL', 'string', { note: '完整 URL；留空则按 host 记录' }),
  f('host', 'host', 'string', { max: ASSET_HOST_MAX }),
  f('ip', 'IP', 'string'),
  f('port', '端口', 'number', { min: 0, note: '整数或 null' }),
  f('protocol', '协议', 'string', { max: ASSET_PROTOCOL_MAX, note: '如 https' }),
  f('title', '页面标题', 'string', { max: ASSET_TITLE_MAX }),
  f('category', '资产类别', 'enum', { values: ASSET_CATEGORY_KEYS }),
  f('weight', '肥瘦', 'enum', { values: ['fat', 'thin'], note: 'fat=肥面，thin=瘦壳' }),
  f('ownership', '归属', 'enum', { values: OWNERSHIPS }),
  f('aliveStatus', '存活状态', 'enum', { values: ALIVE_STATUSES }),
  f('sameSkinGroup', '同皮组', 'string', { max: ASSET_SAME_SKIN_MAX }),
  f('riskNote', '风险备注', 'string', { max: ASSET_NOTE_MAX }),
  f('brief', '进站说明', 'object', {
    note: '{ user, objects, money, preAuth } 四个字符串字段',
  }),
  f('seedId', '所属种子 id', 'string', { note: '可空' }),
  f('fp', '16 栏技术栈', 'object', { note: '按栏位 key 给 { name, ver? } 数组' }),
  f('vulnRefs', '历史漏洞', 'array', { note: '[{ vulnId, status, note? }]' }),
  f('checklist', '本轮完成 11 项', 'object', {
    note: `${CHECKLIST_ITEMS.map((item) => item.key).join(' / ')}，均为布尔`,
  }),
];

const endpointFields: AiSchemaField[] = [
  f('assetId', '所属资产 id', 'string', { required: true }),
  f('featureId', '功能点 id', 'string', { note: '可空；默认直接挂资产' }),
  f('method', 'HTTP 方法', 'enum', { required: true, values: HTTP_METHODS }),
  f('path', '路径', 'string', { required: true, max: 2000, note: '如 /api/order/detail' }),
  f('fullUrl', '完整 URL', 'string', { max: 2000, note: '可空；留空用 asset.url + path 拼' }),
  f('source', '来源', 'enum', { required: true, values: ENDPOINT_SOURCES }),
  f('params', '参数', 'array', {
    note: `[{ name, location, note? }]，location ∈ ${PARAM_LOCATIONS.join(' / ')}`,
  }),
  f('accessState', '可访问性', 'enum', { values: ACCESS_STATES }),
  f('respSignature', '响应特征', 'enum', { values: RESP_SIGNATURES }),
  f('diffSurface', '是否有差分面', 'boolean', {
    note: '有 total / 条数 / 回显 / 会拉 URL 即为 true',
  }),
  f('keys', '抄到的钥匙', 'array', { note: '字符串数组：签名盐 / 硬编码 key / 演示号' }),
  f('note', '备注', 'string', { max: 500 }),
];

const testFields: AiSchemaField[] = [
  f('endpointId', '接口 id', 'string', { note: '与 assetId 二选一，接口级优先' }),
  f('assetId', '资产 id', 'string', { note: '接口级缺省时用资产级兜底' }),
  f('vulnType', '漏洞类型', 'enum', { required: true, values: VULN_IDS }),
  f('state', '状态', 'enum', { required: true, values: TEST_STATES }),
  f('naReason', 'N-A 原因', 'enum', { values: NA_REASONS, note: 'state=N-A 时必填' }),
  f('payload', 'payload', 'string', { note: '可复制文本，程序不执行' }),
  f('baseline', '正常基线', 'string'),
  f('evidence', '回包片段', 'string'),
  f('vulnRefId', '关联历史漏洞', 'string', { note: '可空' }),
];

const seedFields: AiSchemaField[] = [
  f('keyword', '种子词', 'string', { required: true, max: 80 }),
  f('type', '优先级', 'enum', { required: true, values: SEED_TYPES }),
  f('status', '状态', 'enum', {
    values: SEED_STATUSES,
    note: '默认 pending；同一项目同时只允许一个 doing',
  }),
  f('source', '来源', 'enum', { required: true, values: SEED_SOURCES }),
  f('parentHost', '回灌来源 host', 'string', { max: 200, note: '可空' }),
  f('poolSize', '池大小', 'number', { min: 0 }),
  f('aliveFilter', '活筛状态', 'enum', { values: SEED_ALIVE_FILTERS }),
  f('note', '备注', 'string', { max: 500 }),
];

const projectFields: AiSchemaField[] = [
  f('name', '项目名称', 'string', { required: true, max: PROJECT_NAME_MAX }),
  f('targetName', '目标名称', 'string', { required: true, max: TARGET_NAME_MAX }),
  f('mode', '模式', 'enum', {
    values: PROJECT_MODES,
    note: 'lock=锁面（不主动出圈），free=自由跳（启用种子队列）',
  }),
  f('scopeNote', '授权范围说明', 'string', { max: 2000 }),
  f('srcUrl', 'SRC 地址', 'string', { max: 500 }),
];

const endpoints: AiSchemaEndpoint[] = [
  {
    group: '项目',
    method: 'POST',
    path: '/api/projects',
    summary: '新建项目',
    fields: projectFields,
    example: {
      name: '示例项目',
      targetName: '示例集团',
      mode: 'free',
      scopeNote: 'only *.example.com',
    },
  },
  {
    group: '项目',
    method: 'PATCH',
    path: '/api/projects/:projectId',
    summary: '更新项目（只传要改的字段）',
    fields: [...projectFields, f('status', '项目状态', 'enum', { values: PROJECT_STATUSES })],
    example: { scopeNote: 'only *.example.com，不含测试域' },
  },
  {
    group: '项目',
    method: 'PUT',
    path: '/api/projects/:projectId/activate',
    summary: '切换当前项目',
    fields: [],
  },
  {
    group: '资产',
    method: 'POST',
    path: '/api/projects/:projectId/assets',
    summary: '新建资产（先建资产，接口/矩阵/种子都挂在它上面）',
    fields: assetFields,
    example: { name: '商城管理后台', url: 'https://admin.example.com/', aliveStatus: '存活' },
  },
  {
    group: '资产',
    method: 'PATCH',
    path: '/api/projects/:projectId/assets/:assetId',
    summary: '更新资产（部分字段；covered 由 checklist 派生，不能直接写）',
    fields: assetFields,
    example: { aliveStatus: '403', brief: { user: '运营', objects: '订单', money: '退款', preAuth: '登录页' } },
  },
  {
    group: '资产',
    method: 'DELETE',
    path: '/api/projects/:projectId/assets/:assetId',
    summary: '删除资产（级联删该资产的接口与测试格）',
    fields: [],
  },
  {
    group: '接口',
    method: 'POST',
    path: '/api/projects/:projectId/endpoints',
    summary: '新建接口',
    fields: endpointFields,
    example: {
      assetId: 'a_xxxxxxxx',
      method: 'GET',
      path: '/api/order/detail',
      source: '手工录入',
      accessState: '匿名可访问-有业务字段',
      respSignature: '有业务JSON',
      params: [{ name: 'id', location: 'query' }],
    },
  },
  {
    group: '接口',
    method: 'PATCH',
    path: '/api/projects/:projectId/endpoints/:endpointId',
    summary: '更新接口',
    fields: endpointFields,
    example: { accessState: '需登录' },
  },
  {
    group: '接口',
    method: 'DELETE',
    path: '/api/projects/:projectId/endpoints/:endpointId',
    summary: '删除接口（级联删该接口的测试格）',
    fields: [],
  },
  {
    group: '接口',
    method: 'POST',
    path: '/api/projects/:projectId/endpoints/import',
    summary: '批量导入接口（纯字符串解析，不发请求）',
    fields: [
      f('assetId', '所属资产 id', 'string', { required: true }),
      f('format', '导入格式', 'enum', { required: true, values: ['path', 'curl', 'swagger'] }),
      f('text', '导入内容', 'string', { required: true, note: '路径列表 / curl 命令 / Swagger JSON' }),
      f('dryRun', '只预览不落盘', 'boolean', { note: '默认 false' }),
    ],
    example: { assetId: 'a_xxxxxxxx', format: 'path', text: '/api/order/detail\n/api/user/info', dryRun: true },
  },
  {
    group: '接口',
    method: 'POST',
    path: '/api/projects/:projectId/endpoints/batch-access',
    summary: '批量设置可访问性',
    fields: [
      f('ids', '接口 id 列表', 'array', { required: true }),
      f('accessState', '可访问性', 'enum', { required: true, values: ACCESS_STATES }),
    ],
    example: { ids: ['ep_xxxxxxxx'], accessState: '需登录' },
  },
  {
    group: '测试矩阵',
    method: 'POST',
    path: '/api/projects/:projectId/tests',
    summary: '写入/更新一个测试格（同接口同漏洞类型会覆盖）',
    fields: testFields,
    example: {
      endpointId: 'ep_xxxxxxxx',
      vulnType: 'AUTH-01',
      state: '打穿',
      payload: 'id=10002',
      evidence: '返回他人订单',
    },
  },
  {
    group: '测试矩阵',
    method: 'POST',
    path: '/api/projects/:projectId/tests/batch',
    summary: '批量写测试格（最多 500 个）',
    fields: [
      f('cells', '单元格列表', 'array', {
        required: true,
        note: '每项与单格字段相同：endpointId / assetId / vulnType / state / naReason / payload / baseline / evidence / vulnRefId',
      }),
    ],
    example: { cells: [{ endpointId: 'ep_xxxxxxxx', vulnType: 'AUTH-01', state: 'N-A', naReason: '无鉴权口' }] },
  },
  {
    group: '测试矩阵',
    method: 'PATCH',
    path: '/api/projects/:projectId/tests/:id',
    summary: '更新测试格',
    fields: testFields,
    example: { state: '证伪' },
  },
  {
    group: '测试矩阵',
    method: 'DELETE',
    path: '/api/projects/:projectId/tests/:id',
    summary: '删除测试格（回到未测）',
    fields: [],
  },
  {
    group: '种子',
    method: 'POST',
    path: '/api/projects/:projectId/seeds',
    summary: '新增种子（doing 有未完成活面时新增 pending 会记破闸日志）',
    fields: seedFields,
    example: { keyword: '示例集团', type: 'P0', source: '用户原词', aliveFilter: '通过', poolSize: 12 },
  },
  {
    group: '种子',
    method: 'PATCH',
    path: '/api/projects/:projectId/seeds/:id',
    summary: '更新种子',
    fields: seedFields,
    example: { aliveFilter: '通过' },
  },
  {
    group: '种子',
    method: 'POST',
    path: '/api/projects/:projectId/seeds/:id/status',
    summary: '切换种子状态（doing 唯一，冲突返回 409 SEED_GATE_BUSY）',
    fields: [f('status', '状态', 'enum', { required: true, values: SEED_STATUSES })],
    example: { status: 'doing' },
  },
  {
    group: '种子',
    method: 'DELETE',
    path: '/api/projects/:projectId/seeds/:id',
    summary: '删除种子（关联资产的 seedId 置空，不删资产）',
    fields: [],
  },
  {
    group: '报告',
    method: 'POST',
    path: '/api/reports',
    summary: '创建 docx 报告（复制内置空白模板，只登记文件名）',
    fields: [
      f('projectId', '项目 id', 'string', { required: true }),
      f('name', '显示名', 'string', { max: 80, note: '可空，默认「未命名报告」' }),
    ],
    example: { projectId: 'p_xxxxxxxx', name: '订单越权验证' },
  },
  {
    group: '报告',
    method: 'POST',
    path: '/api/reports/:id/open',
    summary: '用系统默认程序打开 docx',
    fields: [],
  },
  {
    group: '报告',
    method: 'DELETE',
    path: '/api/reports/:id',
    summary: '删除报告（默认只移除登记；deleteFile=1 才删 docx）',
    fields: [f('deleteFile', '同时删除文件', 'boolean', { note: 'query 参数，1/true' })],
  },
  {
    group: '设置',
    method: 'POST',
    path: '/api/projects/:projectId/import',
    summary: '导入单项目 JSON（覆盖当前项目，写入前自动备份）',
    fields: [f('data', '项目全量数据', 'object', { required: true, note: 'ProjectData 结构；project.id 会被强制为 URL 里的 id' })],
  },
  {
    group: '设置',
    method: 'POST',
    path: '/api/projects/:projectId/backup',
    summary: '手动备份当前项目',
    fields: [],
  },
  {
    group: '项目',
    method: 'DELETE',
    path: '/api/projects/:projectId',
    summary: '删除项目（连同 data/ 下的 JSON 与备份）',
    fields: [],
  },
];

export const AI_SCHEMA: AiSchema = {
  app: 'HUNTER',
  version: 1,
  baseUrl: '/api',
  hint: '本地单机、无鉴权；写操作一律 JSON body（Content-Type: application/json）。先 GET 项目数据拿现有 id，再按字段 POST/PATCH。',
  projectData: {
    method: 'GET',
    path: '/api/projects/:projectId',
    note: '一次拿全量 ProjectData（project / assets / endpoints / tests / seeds / reportFiles 等）',
  },
  endpoints,
  enums: {
    projectMode: PROJECT_MODES,
    projectStatus: PROJECT_STATUSES,
    assetCategory: ASSET_CATEGORY_KEYS,
    assetWeight: ['fat', 'thin'],
    assetOwnership: OWNERSHIPS,
    aliveStatus: ALIVE_STATUSES,
    httpMethod: HTTP_METHODS,
    endpointSource: ENDPOINT_SOURCES,
    accessState: ACCESS_STATES,
    respSignature: RESP_SIGNATURES,
    paramLocation: PARAM_LOCATIONS,
    testState: TEST_STATES,
    naReason: NA_REASONS,
    vulnType: VULN_IDS,
    seedType: SEED_TYPES,
    seedStatus: SEED_STATUSES,
    seedSource: SEED_SOURCES,
    seedAliveFilter: SEED_ALIVE_FILTERS,
    checklistKey: CHECKLIST_ITEMS.map((item) => item.key),
  },
};
