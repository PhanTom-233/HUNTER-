/**
 * 前后端共用常量 / 字典。
 *
 * 只放「数据」与「文案映射」，不放业务逻辑。
 */

import type {
  AccessState,
  AliveStatus,
  AssetCategory,
  AssetOwnership,
  ChecklistKey,
  EndpointSource,
  FpCategoryKey,
  HttpMethod,
  NaReason,
  ParamLocation,
  ReportSeverity,
  ReportStatus,
  RespSignature,
  SeedAliveFilter,
  SeedPriority,
  SeedSource,
  SeedStatus,
  TestState,
  VulnSeverity,
  VulnRefStatus,
  VulnSource,
} from './types';

/** 图谱 7 种手动边类型的元数据放在独立数据文件里，这里只做 re-export，避免两份定义 */
export {
  RELATION_TYPE_META,
  RELATION_TYPES,
  RELATION_LABEL,
  RELATION_DESC,
  RELATION_COLOR,
} from './relationTypes';
export type { RelationTypeMeta } from './relationTypes';


/** 程序版本（/api/health 与侧边栏底部都读它） */
export const APP_VERSION = '1.0.0';

/** 应用名，显示在侧边栏品牌区 */
export const APP_NAME = 'HUNTER';
export const APP_TAGLINE = '渗透测试工作流管理台';

/** 方法论包：已内置在 skill/，不依赖任何本机路径，可整包分发 */
export const BUNDLED_SKILL_LABEL = '内置 Skill';
export const BUNDLED_SKILL_VERSION = 'bundled';

/** localStorage 键 */
export const STORAGE_KEY_THEME = 'hunter.theme';
export const STORAGE_KEY_ACTIVE_PROJECT = 'hunter.activeProjectId';

/** 项目名 / 目标名的长度约束（前后端共用，避免两边写不一样） */
export const PROJECT_NAME_MAX = 60;
export const TARGET_NAME_MAX = 120;

/* ------------------------------------------------------------------ */
/* 模式文案                                                            */
/* ------------------------------------------------------------------ */

export interface ModeMeta {
  label: string;
  /** 一句话说明，用于徽章 title 与卡片 */
  short: string;
  desc: string;
}

export const MODE_META: Record<'lock' | 'free', ModeMeta> = {
  lock: {
    label: '锁面',
    short: '只打授权面，不主动出圈',
    desc: '只打授权范围内的资产。种子队列与查询方向灰化不可用，扩面按钮统一提示「锁面模式不主动出圈」。',
  },
  free: {
    label: '自由跳',
    short: '启用种子队列与纯文本查询方向',
    desc: '启用种子队列（P0/P1/P2）、纯文本查询方向与优质面回灌，用于需要持续扩面的 SRC 场景；不生成可执行查询。',
  },
};

export const MODE_LABEL: Record<'lock' | 'free', string> = {
  lock: MODE_META.lock.label,
  free: MODE_META.free.label,
};

export const PROJECT_STATUS_LABEL: Record<'active' | 'paused' | 'archived', string> = {
  active: '进行中',
  paused: '暂停',
  archived: '归档',
};

/* ------------------------------------------------------------------ */
/* 资产字典                                                            */
/* ------------------------------------------------------------------ */

export interface CategoryMeta {
  label: string;
  /** 卡片左侧类型色条用的 CSS 变量名 */
  colorVar: string;
  /** 默认肥瘦（允许手动覆盖） */
  weight: 'fat' | 'thin';
  /** 大资产展开进站七步 / 瘦面轻量面板 */
  heavy: boolean;
}

export const CATEGORIES: Record<AssetCategory, CategoryMeta> = {
  big_system: { label: '大资产系统', colorVar: 'var(--blue)', weight: 'fat', heavy: true },
  single_page: { label: '独立小页面', colorVar: 'var(--cyan)', weight: 'thin', heavy: false },
  api_service: { label: 'API 服务', colorVar: 'var(--blue)', weight: 'fat', heavy: true },
  admin_console: { label: '管理后台', colorVar: 'var(--violet, #a78bfa)', weight: 'fat', heavy: true },
  middleware: { label: '中间件暴露面', colorVar: 'var(--amber)', weight: 'thin', heavy: true },
  mobile_h5: { label: '移动端 H5 / 小程序', colorVar: 'var(--cyan)', weight: 'thin', heavy: true },
  static_shell: { label: '静态壳', colorVar: 'var(--dim)', weight: 'thin', heavy: false },
};

export const ASSET_CATEGORY_KEYS: AssetCategory[] = [
  'big_system',
  'single_page',
  'api_service',
  'admin_console',
  'middleware',
  'mobile_h5',
  'static_shell',
];

export const ALIVE_STATUSES: AliveStatus[] = [
  '存活',
  '401',
  '403',
  '登录墙',
  '停放页',
  '超时',
  '死链',
  '未探活',
];

export const OWNERSHIPS: AssetOwnership[] = ['全资', '参股', '未知', '非范围'];

/** 16 栏技术栈的显示顺序与中文名 */
export const FP_CATEGORIES: { key: FpCategoryKey; label: string; hint: string }[] = [
  { key: 'webServer', label: 'Web 服务器', hint: 'Nginx / Apache / IIS / Tomcat' },
  { key: 'language', label: '语言运行时', hint: 'Java / PHP / Python / Node / .NET' },
  { key: 'webFramework', label: '后端框架', hint: 'Spring Boot / Laravel / Django' },
  { key: 'jsFramework', label: '前端框架', hint: 'Vue / React / Angular / Next.js' },
  { key: 'jsLibrary', label: '前端库', hint: 'jQuery / axios / element-ui' },
  { key: 'buildTool', label: '构建工具', hint: 'webpack / vite / umi' },
  { key: 'middleware', label: '中间件', hint: 'Nacos / Redis / RabbitMQ / Elasticsearch' },
  { key: 'cms', label: 'CMS / 低代码', hint: '若依 / JEECG / DedeCMS' },
  { key: 'auth', label: '认证组件', hint: 'Shiro / Spring Security / JWT' },
  { key: 'gateway', label: '网关代理', hint: 'Kong / APISIX / Spring Cloud Gateway' },
  { key: 'dbOrm', label: '数据层特征', hint: 'MyBatis / Hibernate / Sequelize' },
  { key: 'cloud', label: '云与对象存储', hint: '阿里云 OSS / 腾讯云 COS / S3' },
  { key: 'waf', label: '防护', hint: '阿里云盾 / 雷池 / Cloudflare' },
  { key: 'devops', label: '运维组件', hint: 'Jenkins / GitLab / Nexus / Grafana' },
  { key: 'container', label: '容器与编排', hint: 'Docker API / K8s Dashboard' },
  { key: 'mobile', label: '移动端', hint: 'uni-app / 微信小程序 / Flutter' },
];

/** 16 栏的 key 数组（顺序与 FP_CATEGORIES 一致，服务端校验只允许这些 key） */
export const FP_CATEGORY_KEYS: FpCategoryKey[] = FP_CATEGORIES.map((item) => item.key);

/** 每类的默认肥瘦（`deriveWeight` 的同一份口径，UI 与后端都用它） */
export const CATEGORY_DEFAULT_WEIGHT: Record<AssetCategory, 'fat' | 'thin'> = {
  big_system: 'fat',
  api_service: 'fat',
  admin_console: 'fat',
  single_page: 'thin',
  static_shell: 'thin',
  mobile_h5: 'thin',
  middleware: 'thin',
};

/** 资产类别的一句话说明（编辑抽屉的类别选择用） */
export const CATEGORY_DESC: Record<AssetCategory, string> = {
  big_system: '完整业务系统，展开「进站七步」全流程',
  single_page: '独立落地页 / 活动页，只做轻量面板',
  api_service: '纯 API / 接口服务，重点接口清单与鉴权',
  admin_console: '后台管理端，优先默认口令与越权',
  middleware: '中间件 / 组件暴露面，看未授权与默认配置',
  mobile_h5: '移动端 H5 / 小程序，注意鉴权差异与硬编码',
  static_shell: '静态壳 / 停放页，一眼证伪即可',
};

/** 资产字段长度约束（前后端共用） */
export const ASSET_NAME_MAX = 80;
export const ASSET_URL_MAX = 500;
export const ASSET_HOST_MAX = 200;
export const ASSET_TITLE_MAX = 200;
export const ASSET_PROTOCOL_MAX = 20;
export const ASSET_SAME_SKIN_MAX = 60;
export const ASSET_NOTE_MAX = 2000;
export const FP_NAME_MAX = 80;
export const FP_VERSION_MAX = 40;
export const FP_EVIDENCE_MAX = 300;

/** 历史漏洞的字典（编辑抽屉里的下拉选项） */
export const VULN_REF_STATUSES: VulnRefStatus[] = ['待验证', '已验证', '不适用'];
export const VULN_SOURCES: VulnSource[] = ['CVE', 'CNVD', '厂商通告', '经验'];
export const VULN_SEVERITIES: VulnSeverity[] = ['严重', '高危', '中危'];


/** §4.3 的 11 项「本轮完成」清单 */
export const CHECKLIST_ITEMS: { key: ChecklistKey; label: string }[] = [
  { key: 'briefDone', label: '已说清这摊（brief 四个字段非空）' },
  { key: 'endpointsBuilt', label: '接口清单已建（≥1 条，或勾选「降级：无前端/纯API」并填原因）' },
  { key: 'matrixProbed', label: '类型矩阵探针已勾完（每个类型有状态，N/A 必带原因）' },
  { key: 'paramMatrix', label: '高价值接口参数矩阵已覆盖' },
  { key: 'vulnsLogged', label: '打成的洞已落盘（无洞可勾「无」）' },
  { key: 'noSameSkinWaste', label: '未耗在同皮镜像/已覆盖号段' },
  { key: 'loginBizSurface', label: '若为登录页：已找到并挖过业务面（或确认抽不出，记空壳）' },
  { key: 'sameGate', label: '同闸：未登录例外已点，其余口同一登录码 → 四件套收口' },
  { key: 'authGates', label: '认证口（发会话/重置/改绑/换票/2FA）已勾完或 N/A' },
  { key: 'mediumEscalated', label: '中危已升链（同一对象走到 写/跨用户/接管/执行）' },
  { key: 'fatThinSplit', label: '肥瘦已分流（肥面到对象图，瘦面一眼证伪）' },
];

/** 接口可访问性（核心列） */
export const ACCESS_STATES: AccessState[] = [
  '匿名可访问-有业务字段',
  '匿名可访问-无业务字段',
  '需登录',
  '401',
  '403',
  '404',
  '超时',
  '未测试',
];

/** 接口方法 / 来源 / 回包特征 / 参数位置 */
export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', '*'];
export const ENDPOINT_SOURCES: EndpointSource[] = [
  'JS提取',
  '抓包',
  'Swagger',
  '回包线索',
  '字典',
  '文档',
];
export const RESP_SIGNATURES: RespSignature[] = [
  '有业务JSON',
  '空列表',
  '仅登录码',
  '报错500',
  '超时',
  '静态HTML',
];
export const PARAM_LOCATIONS: ParamLocation[] = ['query', 'body', 'header', 'path'];

/** N-A 原因，必须选不能自由填 */
export const NA_REASONS: NaReason[] = [
  '无该入口',
  '回码仅为登录闸',
  '纯静态页',
  '无写接口',
  '无URL类参数',
  '无回显与写入点',
  '无执行类Sink',
  'CORS不挖',
  '降级无法测',
];

export const TEST_STATES: TestState[] = ['未测', '打穿', '证伪', 'N-A'];

export const SEED_TYPES: SeedPriority[] = ['P0', 'P1', 'P2'];
export const SEED_STATUSES: SeedStatus[] = ['pending', 'doing', 'done', 'cold'];
export const SEED_SOURCES: SeedSource[] = [
  '用户原词',
  '业务名/子品牌',
  '全资子公司(1-4级)',
  'SRC范围页',
  '备案/根域',
  '回灌R',
];
export const SEED_ALIVE_FILTERS: SeedAliveFilter[] = ['未筛', '通过', 'cold'];

export const REPORT_SEVERITIES: ReportSeverity[] = ['严重', '高危', '中危'];

export const REPORT_STATUSES: ReportStatus[] = ['草稿', '已确认', '已提交'];

export const SEVERITY_COLOR: Record<VulnSeverity, string> = {
  严重: 'var(--red)',
  高危: 'var(--amber)',
  中危: 'var(--blue)',
};

/* ------------------------------------------------------------------ */
/* 图谱手动边类型（7 种，禁止自由文本）                                */
/* 元数据与文案在 shared/relationTypes.ts，这里只保留 re-export         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 导航                                                                */
/* ------------------------------------------------------------------ */

export type IconName =
  | 'overview'
  | 'workflow'
  | 'seeds'
  | 'assets'
  | 'endpoints'
  | 'matrix'
  | 'graph'
  | 'reports'
  | 'copilot'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'plus'
  | 'trash'
  | 'close'
  | 'check'
  | 'chevronDown'
  | 'search'
  | 'arrowRight'
  | 'alert'
  | 'lock'
  | 'free'
  | 'spinner'
  | 'folder'
  | 'spark';

export type PageKey =
  | 'overview'
  | 'workflow'
  | 'seeds'
  | 'assets'
  | 'endpoints'
  | 'matrix'
  | 'graph'
  | 'reports'
  | 'copilot'
  | 'ai-read'
  | 'settings';

export interface NavItem {
  key: PageKey;
  label: string;
  icon: IconName;
  /** 哪一块交付实现，1 = 本轮已交付 */
  block: number;
  implemented: boolean;
  /** 一句话：本页干什么 */
  desc: string;
  /** 本页将包含什么（占位页逐条列出，避免空白页） */
  bullets: string[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'overview',
    label: '总览',
    icon: 'overview',
    block: 1,
    implemented: true,
    desc: '项目进度、下一步建议 TOP3、空转预警、最近活动',
    bullets: [
      '4 个指标卡：种子 done/total、资产 covered/total、接口总数、报告数（按等级拆分）',
      '「下一步建议」TOP 3（每条带依据条款与跳转）',
      '空转预警条（规则 A-05 触发时整条变红）',
      '最近 7 天活动热力图（按测试记录数）',
    ],
  },
  {
    key: 'workflow',
    label: '工作流',
    icon: 'workflow',
    block: 7,
    implemented: true,
    desc: 'S1~S8 阶段看板，当前阶段高亮，卡点清单',
    bullets: [
      '顶部横向阶段条：每段显示「完成数 / 总数」，当前阶段呼吸高亮',
      '允许跳阶段，但跳步会留下黄色警示（不硬拦，要让你看见自己破了规矩）',
      '卡点清单：每条带「去处理」跳转与「为什么」（引用规则条款）',
    ],
  },
  {
    key: 'seeds',
    label: '种子队列',
    icon: 'seeds',
    block: 7,
    implemented: true,
    desc: '自由跳模式的种子管理（一种子闭环强约束）',
    bullets: [
      'P0 / P1 / P2 种子队列，同一项目同时只允许一个 doing 种子',
      '破闸新增：doing 种子还有未完成资产时新增 pending，记破闸日志并打红标',
      'P2 必须先活筛（DNS + HTTP + crt.sh），通过后才允许扩面；只记录纯文本查询方向，不生成可执行查询',
      '锁面模式下本页灰化不可用',
    ],
  },
  {
    key: 'assets',
    label: '资产库',
    icon: 'assets',
    block: 2,
    implemented: true,
    desc: '资产卡片/表格，16 栏技术栈、历史漏洞、覆盖度',
    bullets: [
      '资产 CRUD：名称 / URL / IP / 端口 / 类别 / 归属 / 存活状态',
      '16 栏结构化技术栈录入（Server / 语言 / 框架 / 中间件 / WAF …）',
      '填指纹自动带出历史漏洞、追加攻击面、点亮矩阵「待测·有信号」',
      '11 项「本轮完成」清单 + 迷你进度条',
    ],
  },
  {
    key: 'endpoints',
    label: '接口清单',
    icon: 'endpoints',
    block: 4,
    implemented: true,
    desc: '接口树/表，可访问性、差分面、来源',
    bullets: [
      '接口记录：method / path / 参数 / 来源 / 回包特征 / 差分面',
      '「可访问性」彩色徽章：匿名有业务字段=红、403=黄、404/超时=灰',
      '批量粘贴导入：每行 path、curl、Swagger/OpenAPI JSON',
      'JS 里抄到的钥匙（签名盐 / 硬编码 key / 演示号）单独登记',
    ],
  },
  {
    key: 'matrix',
    label: '测试矩阵',
    icon: 'matrix',
    block: 5,
    implemented: true,
    desc: '行=接口/资产，列=漏洞类型（带分工徽章），四态勾选',
    bullets: [
      '列头分工徽章：AI / 人工 / 混合 / 禁用，悬停显示判定条件与最低探针',
      '单元格四态：未测=空心灰、打穿=红底、证伪=绿边、N-A=灰斜纹（必带原因）',
      '三个页签：全部 / 分工视图 / 覆盖统计（AI 与人工覆盖率差 > 40 点变黄）',
      '批量设 N-A：一次写多个单元格，CORS 列固定禁用',
    ],
  },
  {
    key: 'graph',
    label: '资产图谱',
    icon: 'graph',
    block: 3,
    implemented: true,
    desc: '全项目一张大图，纵向拓扑自动生成，横向关联手动画线',
    bullets: [
      '@xyflow/react + elkjs 分层布局，卡片节点 190×56，位置持久化',
      '纵向拓扑自动生成：根域 → 子域 → 主机 → 站点 → 接口 → 漏洞',
      '横向关联（同 IP / 同证书 / 同 favicon / 互调）一律用户手画，程序不猜',
      '路径高亮、过滤、从资产库「在图谱中查看」定位',
    ],
  },
  {
    key: 'reports',
    label: '漏洞报告',
    icon: 'reports',
    block: 6,
    implemented: true,
    desc: 'docx 文档入口：创建 / 打开 / 删除',
    bullets: [
      '创建：复制内置的 2.3 空白 docx（13 个小节骨架）到程序目录 reports/',
      '打开：后端调系统默认程序（Word / WPS），程序不读也不存正文',
      '删除：默认只移除登记、保留文件；真删文件需二次确认',
    ],
  },
  {
    key: 'copilot',
    label: '建议中心',
    icon: 'copilot',
    block: 6,
    implemented: true,
    desc: '按内置方法论给下一步动作',
    bullets: [
      '规则引擎 B/C/D/F 四组：资产级 / 接口级 / 报告合规 / 测试分工',
      '每条建议带依据（引用内置 skill/rules 与 strategy，相对路径）、可复制动作、跳转链接',
      '「生成下一步提示词」：把当前项目上下文拼成可直接粘给 AI 的 prompt',
      '模块速查：按指纹从 skill/index.json 找出该开的那一篇',
    ],
  },
  {
    key: 'ai-read',
    label: 'AI 读这里',
    icon: 'spark',
    block: 8,
    implemented: true,
    desc: '机器可读的 API 结构，供 AI 自动填表',
    bullets: [
      'GET /api/ai-schema 返回全部写接口的字段、中文标签、必填与枚举值',
      '字段中文标签与页面表单项一致，可直接对照填写',
      '只读、不含项目数据、不发任何外部请求',
    ],
  },
  {
    key: 'settings',
    label: '设置',
    icon: 'settings',
    block: 6,
    implemented: true,
    desc: '主题、导入导出、备份',
    bullets: [
      '浅色 / 深色主题切换',
      '单项目 JSON 全量导出 / 导入还原',
      '手动备份与 data/ 目录说明（不含任何路径配置）',
    ],
  },
];

export const NAV_ITEM_MAP: Record<PageKey, NavItem> = NAV_ITEMS.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<PageKey, NavItem>,
);

/** 交付块划分（侧边栏底部进度用） */
export const DELIVERY_BLOCKS: { block: number; title: string; done: boolean }[] = [
  { block: 1, title: '脚手架 / JSON 存储层 / 项目 CRUD', done: true },
  { block: 2, title: '资产库与 16 栏技术栈', done: true },
  { block: 3, title: '资产图谱', done: true },
];

/** 占位页上「这一页什么时候来」的文案 */
export function navBlockLabel(block: number): string {
  if (block <= 3) {
    return `计划在第 ${block} 块交付实现`;
  }
  return '计划在第 3 块之后的后续交付实现';
}
