/**
 * 建议中心规则（B/C/D/F 四组，约 30 条）。
 *
 * 纯数据 + 纯函数：`when` 只读 CopilotContext，不发请求、不读文件。
 * basis 一律使用内置包的相对路径（skill/...），不引用任何外部目录。
 * A/E 组依赖种子队列，本阶段不实现；seeds 为空时这些规则自然不存在。
 */

import type { PageKey } from '../../shared/constants';
import type { ExecMode } from '../../shared/types';
import type { CopilotContext } from './context';

export interface CopilotRule {
  id: string;
  group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  priority: 1 | 2 | 3 | 4 | 5;
  title: string;
  basis: string;
  when: (ctx: CopilotContext) => boolean;
  action: string;
  /** 可复制的纯文本模板；程序不会发送任何请求 */
  payload?: string;
  jumpTo?: PageKey;
}

/** 分工筛选：未显式标注的规则按 hybrid 归类 */
export const RULE_WORK: Partial<Record<string, ExecMode>> = {
  'C-01': 'manual',
  'C-02': 'hybrid',
  'C-03': 'ai',
  'C-04': 'hybrid',
  'C-05': 'hybrid',
  'C-06': 'hybrid',
  'C-07': 'hybrid',
  'C-08': 'hybrid',
  'C-09': 'hybrid',
  'C-10': 'hybrid',
  'F-01': 'ai',
  'F-02': 'manual',
  'F-03': 'ai',
  'F-04': 'manual',
  'F-05': 'hybrid',
  'F-06': 'hybrid',
};

const FOUR_PIECE = ['INJ-01', 'INJ-03', 'CLI-01', 'SRV-01'];

function hasEndpoint(
  ctx: CopilotContext,
  predicate: (endpoint: CopilotContext['endpoints'][number]) => boolean,
): boolean {
  return ctx.endpoints.some(predicate);
}

function hasTest(
  ctx: CopilotContext,
  predicate: (test: CopilotContext['tests'][number]) => boolean,
): boolean {
  return ctx.tests.some(predicate);
}

export const COPILOT_RULES: CopilotRule[] = [
  /* ---------------------------- B · 资产级 ---------------------------- */
  {
    id: 'B-01',
    group: 'B',
    priority: 2,
    title: '登录墙不是死站：先找登录后的业务面',
    basis: 'skill/rules/src-value-hunting.md §2',
    when: (ctx) => ctx.assets.some((asset) => asset.aliveStatus === '登录墙' || asset.aliveStatus === '401'),
    action: '把登录墙当入口而不是终点：找注册/找回/试用/公开列表，确认登录后真正的业务对象。',
    jumpTo: 'assets',
  },
  {
    id: 'B-02',
    group: 'B',
    priority: 2,
    title: '401 / 403 不当死站：先改 path、METHOD、头',
    basis: 'skill/rules/src-value-hunting.md §2',
    action: '现场换 path 后缀、大小写、METHOD、X-Forwarded-* / 角色头，再判断是否真的不可达。',
    when: (ctx) => ctx.assets.some((asset) => asset.aliveStatus === '401' || asset.aliveStatus === '403'),
    jumpTo: 'assets',
  },
  {
    id: 'B-03',
    group: 'B',
    priority: 3,
    title: '指纹已带出历史漏洞：逐条验证利用条件',
    basis: 'skill/strategy/33-evidence-pack-and-quality-gate.md',
    when: (ctx) =>
      ctx.assets.some((asset) => asset.vulnRefs.some((ref) => ref.status !== '不适用')),
    action: '按资产指纹带出的历史漏洞逐条核对版本 / 配置 / 可达性，别只停在「有记录」。',
    jumpTo: 'assets',
  },
  {
    id: 'B-04',
    group: 'B',
    priority: 3,
    title: '肥面先抽 JS / source map，再补接口',
    basis: 'skill/knowledge-base/js-reverse-guide.md',
    when: (ctx) => ctx.assets.some((asset) => asset.weight === 'fat'),
    action: '对肥面资产抽 JS、source map、路由表与硬编码钥匙，先把接口清单补全再进矩阵。',
    jumpTo: 'endpoints',
  },
  {
    id: 'B-05',
    group: 'B',
    priority: 4,
    title: '瘦壳一眼证伪，不占满全矩阵',
    basis: 'skill/rules/src-value-hunting.md §4',
    when: (ctx) =>
      ctx.assets.some(
        (asset) =>
          asset.weight === 'thin' && !ctx.endpoints.some((endpoint) => endpoint.assetId === asset.id),
      ),
    action: '瘦壳先确认静态页 / 停放页 / 无业务入口，能证伪就标 N-A，不把全矩阵铺满。',
    jumpTo: 'matrix',
  },
  {
    id: 'B-06',
    group: 'B',
    priority: 3,
    title: '项目授权范围或资产 brief 还没填',
    basis: 'skill/rules/security-research-context.md',
    when: (ctx) =>
      !ctx.project.scopeNote.trim() ||
      ctx.assets.some(
        (asset) => !asset.brief.user.trim() || !asset.brief.objects.trim(),
      ),
    action: '先补项目授权范围和资产 brief（谁在用 / 核心对象），否则后面的越权与影响判断没有基准。',
    jumpTo: 'assets',
  },
  {
    id: 'B-07',
    group: 'B',
    priority: 5,
    title: '同皮资产只做代表，别重复耗时间',
    basis: 'skill/strategy/30-src-target-profiling-and-asset-priority.md',
    when: (ctx) => ctx.assets.some((asset) => Boolean(asset.sameSkinGroup.trim())),
    action: '同皮组选 2–3 个代表做深，其余只做存活与指纹确认，把时间留给不同业务面。',
    jumpTo: 'assets',
  },
  {
    id: 'B-08',
    group: 'B',
    priority: 4,
    title: '技术栈还空着，探针会选不准',
    basis: 'skill/strategy/10-passive-recon.md',
    when: (ctx) => ctx.assets.some((asset) => asset.fingerprints.length === 0),
    action: '先补 Server 头 / 框架 / 中间件 / 版本等指纹，矩阵的注入与组件探针才有依据。',
    jumpTo: 'assets',
  },

  /* ---------------------------- C · 接口级 ---------------------------- */
  {
    id: 'C-01',
    group: 'C',
    priority: 1,
    title: '匿名就能出业务字段：先换 id / 越权',
    basis: 'skill/rules/src-value-hunting.md §3',
    when: (ctx) =>
      hasEndpoint(ctx, (endpoint) => endpoint.accessState === '匿名可访问-有业务字段'),
    action: '不要先交「未授权」；把当前 id 换成邻号 / 他人 id / 空 / 0 / -1，确认是否出他人主体数据。',
    payload: 'id=10001 -> 10002 / id=0 / id=-1 / id=',
    jumpTo: 'endpoints',
  },
  {
    id: 'C-02',
    group: 'C',
    priority: 2,
    title: '回包只有登录码：同闸，四件套整段 N-A',
    basis: 'skill/knowledge-base/authbypass-test.md',
    when: (ctx) => hasEndpoint(ctx, (endpoint) => endpoint.respSignature === '仅登录码'),
    action: '同闸：四件套整段 N-A（原因写「回码仅为登录闸」），转认证口（发会话 / 重置 / 改绑 / 换票 / 2FA）。',
    jumpTo: 'endpoints',
  },
  {
    id: 'C-03',
    group: 'C',
    priority: 1,
    title: '空列表 / 500 / 超时：有差分面，必须测',
    basis: 'skill/rules/src-value-hunting.md §3',
    when: (ctx) =>
      hasEndpoint(
        ctx,
        (endpoint) =>
          endpoint.respSignature === '空列表' ||
          endpoint.respSignature === '报错500' ||
          endpoint.respSignature === '超时',
      ),
    action: '这不是「请登录」：换参、换 id、按栈选探针，把差分面打出来再判断。',
    jumpTo: 'matrix',
  },
  {
    id: 'C-04',
    group: 'C',
    priority: 1,
    title: 'URL / 回调 / 文件路径类参数：先测 SSRF 与路径',
    basis: 'skill/knowledge-base/ssrf-test.md',
    when: (ctx) =>
      hasEndpoint(
        ctx,
        (endpoint) =>
          endpoint.params.some((param) =>
            /url|uri|callback|redirect|target|dest|domain|host|file|path/i.test(param.name),
          ) ||
          /[?&](url|uri|callback|redirect|target|dest|domain|host|file|path)=/i.test(endpoint.path),
      ),
    action: '把 URL 类参数换成受控回连地址，先看是否发起请求；文件路径类先看越界读取 / 下载。',
    payload: 'url=<受控回连地址>&file=../../<目标文件>',
    jumpTo: 'endpoints',
  },
  {
    id: 'C-05',
    group: 'C',
    priority: 2,
    title: '查询参数齐全：按技术栈选注入探针',
    basis: 'skill/playbooks/sqli.md',
    when: (ctx) =>
      hasEndpoint(ctx, (endpoint) => endpoint.params.some((param) => param.in === 'query')),
    action: '按指纹选 SQL / 命令 / 模板 / XSS 探针；优先吃 id、状态、金额、搜索词的参数。',
    payload: "id=1' AND '1'='1\nq=<script>alert(1)</script>",
    jumpTo: 'endpoints',
  },
  {
    id: 'C-06',
    group: 'C',
    priority: 3,
    title: '列表接口过了：打附件、导出、批量下载',
    basis: 'skill/playbooks/file-upload/00-index.md',
    when: (ctx) =>
      hasEndpoint(ctx, (endpoint) => /list|page|export|download|upload|attachment/i.test(endpoint.path)),
    action: '列表通过后看附件下载 / 导出任务 / 批量接口，重点确认文件名、路径与归属校验。',
    jumpTo: 'endpoints',
  },
  {
    id: 'C-07',
    group: 'C',
    priority: 3,
    title: '写接口：加字段、跳步、改状态',
    basis: 'skill/playbooks/logic-flaws/00-index.md',
    when: (ctx) =>
      hasEndpoint(ctx, (endpoint) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(endpoint.method)),
    action: '对写接口补隐藏字段（role / tenantId / amount / status）、跳步调用、重放与并发，观察最终业务状态。',
    payload: '{"role":"admin","tenantId":"<他人租户>","amount":0}',
    jumpTo: 'endpoints',
  },
  {
    id: 'C-08',
    group: 'C',
    priority: 3,
    title: '匿名可访问但没业务字段：转跨用户 / 注入 / 提权',
    basis: 'skill/rules/src-value-hunting.md §3',
    when: (ctx) =>
      hasEndpoint(ctx, (endpoint) => endpoint.accessState === '匿名可访问-无业务字段'),
    action: '不要停在「没数据」：换 id / 换租户 / 加参数 / 看错误回显，往跨用户与提权方向走。',
    jumpTo: 'matrix',
  },
  {
    id: 'C-09',
    group: 'C',
    priority: 1,
    title: '四件套空窗：SQL / RCE / XSS / SSRF 全无完成态',
    basis: 'skill/rules/src-value-hunting.md §3',
    when: (ctx) =>
      ctx.endpoints.length > 0 && FOUR_PIECE.every((vulnType) => !ctx.doneVulnTypes.has(vulnType)),
    action: '四件套至少各挑一个最肥接口打一枪：INJ-01 SQL、INJ-03 RCE、CLI-01 XSS、SRV-01 SSRF，别让整包出现方法论空窗。',
    jumpTo: 'matrix',
  },
  {
    id: 'C-10',
    group: 'C',
    priority: 2,
    title: '接口登记了钥匙：先验钥匙是否真的生效',
    basis: 'skill/knowledge-base/js-reverse-guide.md',
    when: (ctx) => hasEndpoint(ctx, (endpoint) => endpoint.keys.length > 0),
    action: '把签名盐 / 硬编码 key / 演示号拿去重放或做假值对照，先确认它是不是有效闸门。',
    jumpTo: 'endpoints',
  },

  /* ---------------------------- D · 报告合规 ---------------------------- */
  {
    id: 'D-01',
    group: 'D',
    priority: 2,
    title: '中危先升链：同一对象往写 / 跨用户 / 接管 / 执行走',
    basis: 'skill/rules/vuln-report-format.md',
    when: (ctx) => ctx.reports.some((report) => report.severity === '中危'),
    action: '中危不要直接收口：沿同一对象走到写操作、跨用户、账号接管或命令执行，再决定最终等级。',
    jumpTo: 'reports',
  },
  {
    id: 'D-02',
    group: 'D',
    priority: 2,
    title: 'AI 跑出的打穿结果默认待复核',
    basis: 'skill/strategy/33-evidence-pack-and-quality-gate.md',
    when: (ctx) => hasTest(ctx, (test) => test.state === '打穿'),
    action: 'AI 结果标「待复核」，人工确认证据链与影响后才进报告候选池。',
    jumpTo: 'matrix',
  },
  {
    id: 'D-03',
    group: 'D',
    priority: 1,
    title: '接口 200 不算打穿：要最终业务状态证据',
    basis: 'skill/strategy/33-evidence-pack-and-quality-gate.md',
    when: (ctx) => hasTest(ctx, (test) => test.state === '打穿' && !test.evidence.trim()),
    action: '把「回包 200」改成「最终业务状态」：写成功、跨用户可见、权限变更、命令回显，至少有一个。',
    jumpTo: 'matrix',
  },
  {
    id: 'D-04',
    group: 'D',
    priority: 4,
    title: 'CORS / 低危 / 半条链：进不写清单，不单独交报告',
    basis: 'skill/rules/vuln-report-format.md',
    when: (ctx) =>
      hasTest(
        ctx,
        (test) =>
          test.state === 'N-A' &&
          (test.naReason === 'CORS不挖' ||
            test.naReason === '无该入口' ||
            test.naReason === '降级无法测'),
      ),
    action: '把这些项写进不写清单（原因 + 位置），不要为了数量把低危 / 半条链单独交报告。',
    jumpTo: 'reports',
  },
  {
    id: 'D-05',
    group: 'D',
    priority: 3,
    title: '证据里有敏感值：先脱敏再进报告',
    basis: 'skill/strategy/33-evidence-pack-and-quality-gate.md',
    when: (ctx) =>
      hasTest(ctx, (test) => /token|cookie|password|手机|身份证|session/i.test(test.evidence)),
    action: '证据保留结构与差异，隐去 token / cookie / 手机号 / 身份证等敏感值，避免二次泄露。',
    jumpTo: 'matrix',
  },
  {
    id: 'D-06',
    group: 'D',
    priority: 3,
    title: '报告正文交给 docx，程序只保留文件名',
    basis: 'skill/templates/report.md',
    when: (ctx) => ctx.reportFiles.length > 0 && ctx.reports.length === 0,
    action: '正文在 Word / WPS 里写；程序里的 reportFiles 只是文档入口，漏洞记录另记在 reports。',
    jumpTo: 'reports',
  },

  /* ---------------------------- F · 测试分工 ---------------------------- */
  {
    id: 'F-01',
    group: 'F',
    priority: 2,
    title: 'AI 可先跑的项：指纹、敏感路径、默认口令、密钥正则',
    basis: 'skill/strategy/31-specialty-routing-and-account-matrix.md',
    when: (ctx) => ctx.endpoints.length > 0 && ctx.doneCells < ctx.totalCells,
    action: '先把客观、可批量、失败无副作用的项交给 AI 跑；结果标待复核，不直接当结论。',
    jumpTo: 'matrix',
  },
  {
    id: 'F-02',
    group: 'F',
    priority: 1,
    title: '必须人工：对象归属 / 业务影响 / 账号对照',
    basis: 'skill/strategy/31-specialty-routing-and-account-matrix.md',
    when: (ctx) =>
      hasEndpoint(ctx, (endpoint) =>
        endpoint.params.some((param) => /id|user|account|order|tenant/i.test(param.name)),
      ),
    action: '建两个账号做对照，人工确认「这个 id 是不是别人的」；AI 判不了数据归属与业务影响。',
    jumpTo: 'matrix',
  },
  {
    id: 'F-03',
    group: 'F',
    priority: 3,
    title: 'AI 可先跑：指纹已齐的组件默认口与公开面',
    basis: 'skill/strategy/31-specialty-routing-and-account-matrix.md',
    when: (ctx) => ctx.assets.some((asset) => asset.fingerprints.length > 0),
    action: '对已识别组件先跑默认口令、未授权配置、公开控制台与敏感路径，再决定是否人工深入。',
    jumpTo: 'matrix',
  },
  {
    id: 'F-04',
    group: 'F',
    priority: 2,
    title: '业务逻辑必须人工：金额、状态、券、订单',
    basis: 'skill/strategy/31-specialty-routing-and-account-matrix.md',
    when: (ctx) =>
      hasEndpoint(ctx, (endpoint) => /pay|order|wallet|amount|refund|coupon|status/i.test(endpoint.path)),
    action: '金额 / 状态 / 券 / 订单类逻辑要人工理解流程与预期，AI 只负责把请求与差异记全。',
    jumpTo: 'matrix',
  },
  {
    id: 'F-05',
    group: 'F',
    priority: 1,
    title: '偏科告警：AI 覆盖 > 90% 且人工 < 30%',
    basis: 'skill/strategy/19-blind-spot-and-budget.md',
    when: (ctx) =>
      ctx.coverage.byMode.some((bucket) => bucket.key === 'ai' && bucket.total > 0) &&
      ctx.coverage.byMode.some((bucket) => bucket.key === 'manual' && bucket.total > 0) &&
      ctx.coverage.aiPercent > 90 &&
      ctx.coverage.manualPercent < 30,
    action: 'AI 覆盖很高但人工验证不足：优先补对象归属、业务影响、账号对照，不要用 AI 覆盖率替代人工结论。',
    jumpTo: 'matrix',
  },
  {
    id: 'F-06',
    group: 'F',
    priority: 4,
    title: '混合项：AI 先出信号，人工再定危害',
    basis: 'skill/strategy/31-specialty-routing-and-account-matrix.md',
    when: (ctx) => ctx.coverage.byMode.some((bucket) => bucket.key === 'hybrid' && bucket.total > 0),
    action: 'hybrid 项按「AI 出信号 → 人工定危害」走，别让 AI 直接写最终结论。',
    jumpTo: 'matrix',
  },

  /* ---------------------------- A · 流程节奏 ---------------------------- */
  {
    id: 'A-01',
    group: 'A',
    priority: 1,
    title: '当前种子还有活面：先闭环，别开新种',
    basis: 'skill/rules/dig-scope-workflow.md',
    when: (ctx) => Boolean(ctx.doingSeed) && ctx.doingUnfinishedAssets.length > 0,
    action: '当前 doing 种子还有未完成活面，先做覆盖/证伪/记录，再开新种子；否则新种子只会把注意力打散。',
    jumpTo: 'seeds',
  },
  {
    id: 'A-02',
    group: 'A',
    priority: 1,
    title: 'doing 唯一：数据里出现了多个 doing',
    basis: 'skill/rules/hunt-iter.md',
    when: (ctx) => ctx.seeds.filter((seed) => seed.status === 'doing').length > 1,
    action: '只保留一个 doing；把其余种子改回 pending 或 cold，重新排优先级。',
    jumpTo: 'seeds',
  },
  {
    id: 'A-03',
    group: 'A',
    priority: 2,
    title: '全部种子 done：回扫资产与历史漏洞',
    basis: 'skill/rules/hunt-iter.md',
    when: (ctx) => ctx.seeds.length > 0 && ctx.seeds.every((seed) => seed.status === 'done'),
    action: '全 done 后回扫一遍资产：新指纹、历史漏洞、已覆盖资产的相邻 host，决定是否开下一轮种子。',
    jumpTo: 'assets',
  },
  {
    id: 'A-04',
    group: 'A',
    priority: 3,
    title: '连续 2 个种子 0 新增：换随机词 / 换面',
    basis: 'skill/strategy/05-timebox-priority.md',
    when: (ctx) =>
      ctx.seeds.length >= 2 && ctx.seeds.slice(-2).every((seed) => seed.poolSize === 0),
    action: '连续两个种子池大小为 0，别再换同义词硬搜；换业务随机词、换数据源或先做已有资产深挖。',
    jumpTo: 'seeds',
  },
  {
    id: 'A-05',
    group: 'A',
    priority: 2,
    title: '空转预警：doing 超过 20 分钟没有推进',
    basis: 'skill/strategy/19-blind-spot-and-budget.md',
    when: (ctx) =>
      Boolean(ctx.doingSeed) &&
      Date.now() - new Date(ctx.lastActivityAt).getTime() > 20 * 60 * 1000,
    action: '当前 doing 超过 20 分钟没有活动记录：要么补一次矩阵记录，要么明确写「为什么卡住」并换面。',
    jumpTo: 'seeds',
  },
  {
    id: 'A-06',
    group: 'A',
    priority: 4,
    title: '同皮组重复：只留代表，别重复耗时间',
    basis: 'skill/strategy/30-src-target-profiling-and-asset-priority.md',
    when: (ctx) => {
      const groups = ctx.assets
        .map((asset) => asset.sameSkinGroup.trim())
        .filter(Boolean);
      return groups.length > 0 && new Set(groups).size < groups.length;
    },
    action: '同一 sameSkinGroup 只选 2–3 个代表做深，其余只确认存活与指纹，别把同一套代码测十遍。',
    jumpTo: 'assets',
  },
  {
    id: 'A-07',
    group: 'A',
    priority: 2,
    title: 'P2 未活筛：先过了 DNS + HTTP 再扩面',
    basis: 'skill/rules/dig-scope-workflow.md',
    when: (ctx) => ctx.seeds.some((seed) => seed.type === 'P2' && seed.aliveFilter !== '通过'),
    action: 'P2 种子先把 aliveFilter 标成「通过」再扩面；扩面动作仍由外部执行，程序只记录方向。',
    jumpTo: 'seeds',
  },
  {
    id: 'A-08',
    group: 'A',
    priority: 2,
    title: '参股资产：先过股权 / 授权闸',
    basis: 'skill/rules/dig-scope-workflow.md',
    when: (ctx) => ctx.assets.some((asset) => asset.ownership === '参股'),
    action: '参股资产先确认授权来源与可测边界，别把「能访问」当成「可测试」；必要时先问清授权再动。',
    jumpTo: 'assets',
  },
  {
    id: 'A-09',
    group: 'A',
    priority: 3,
    title: '假进度：种子池总量远大于测试覆盖',
    basis: 'skill/strategy/36-failure-decision-tree.md',
    when: (ctx) =>
      ctx.seeds.reduce((sum, seed) => sum + seed.poolSize, 0) > ctx.tests.length * 3,
    action: '扩面数量远大于实际测试记录，说明只是在收集资产；先把已有池子打进矩阵，再继续扩。',
    jumpTo: 'matrix',
  },

  /* ---------------------------- E · 查询方向 ---------------------------- */
  {
    id: 'E-01',
    group: 'E',
    priority: 3,
    title: '优质面回灌根域：把已验证资产反哺种子',
    basis: 'skill/lanes/information-collection.md',
    when: (ctx) => ctx.assets.some((asset) => asset.covered),
    action: '把已 covered 的优质面回灌为根域 / 子品牌种子；查询方向只写纯文本，不生成可执行语句。',
    jumpTo: 'seeds',
  },
  {
    id: 'E-02',
    group: 'E',
    priority: 3,
    title: '403 / 404 接口：换路径、后缀、编码找同源面',
    basis: 'skill/playbooks/info-disclosure.md',
    when: (ctx) =>
      ctx.endpoints.some(
        (endpoint) => endpoint.accessState === '403' || endpoint.accessState === '404',
      ),
    action: '查询方向：同路径换大小写 / 后缀 / 编码 / 方法 / 网关前缀，先找信息泄露与同源旁路；只记录方向，不自动发包。',
    jumpTo: 'endpoints',
  },
  {
    id: 'E-03',
    group: 'E',
    priority: 2,
    title: 'P1 先活域：未筛的 P1 种子先过活筛',
    basis: 'skill/strategy/10-passive-recon.md',
    when: (ctx) => ctx.seeds.some((seed) => seed.type === 'P1' && seed.aliveFilter === '未筛'),
    action: 'P1 种子先做被动活筛（DNS / HTTP / crt.sh 方向），通过后再进资产；查询语句由外部平台执行。',
    jumpTo: 'seeds',
  },
  {
    id: 'E-04',
    group: 'E',
    priority: 4,
    title: 'covered 后新增 host：回扫同根域新面',
    basis: 'skill/strategy/15-active-led-execution.md',
    when: (ctx) => {
      const totalPool = ctx.seeds.reduce((sum, seed) => sum + seed.poolSize, 0);
      return ctx.assets.some((asset) => asset.covered) && totalPool - ctx.assets.length >= 5;
    },
    action: '已有 covered 资产且种子池明显大于当前资产数：按同根域 / 同证书 / 同 C 段方向回扫新增 host，先记录再人工筛选。',
    jumpTo: 'assets',
  },
];

/** 按优先级升序返回当前命中的建议（1 最高） */
export function rankSuggestions(ctx: CopilotContext): CopilotRule[] {
  return COPILOT_RULES.filter((rule) => rule.when(ctx)).sort(
    (left, right) => left.priority - right.priority || left.id.localeCompare(right.id),
  );
}
