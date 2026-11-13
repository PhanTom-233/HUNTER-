/**
 * 从内置 skill/ 目录生成 skill/index.json。
 * 纯 Node，无依赖。改了 skill/ 里的 md 后跑一次：node scripts/build-skill-index.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKILL = path.join(ROOT, 'skill')

const read = (p) => fs.readFileSync(p, 'utf8')

function titleOf(file) {
  const s = read(file)
  const fm = s.match(/^---[\s\S]*?^name:\s*["']?([^"'\n]+)["']?/m)
  if (fm) return fm[1].trim()
  const h = s.match(/^#{1,2}\s+(.+)$/m)
  if (h) return h[1].trim()
  return path.basename(file, '.md')
}

function walk(dir, base) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    const rel = `${base}/${e.name}`.replace(/\\/g, '/')
    if (e.isDirectory()) out.push(...walk(abs, rel))
    else if (e.name.endsWith('.md')) {
      out.push({ id: e.name.replace(/\.md$/, ''), title: titleOf(abs), path: rel })
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

const manifest = JSON.parse(read(path.join(SKILL, 'manifest.json')))

// SKILL.md 的 Specialist Routing 表：信号 → 主 lane。手工固化，避免解析表格出错。
const routing = [
  { signal: 'API 路由 / 对象 / 角色 / token / schema 边界', lane: 'api-security' },
  { signal: '支付 / 订单 / 配额 / 券 / 工作流 / 状态流转', lane: 'business-logic-attack' },
  { signal: '大范围授权目标发现与迭代挖掘', lane: 'src-hunt-lane' },
  { signal: '资产盘点 / 技术栈图谱 / 攻击面排序', lane: 'target-profiling' },
  { signal: '提交决策 / 定级 / 复现 / 证据质量', lane: 'src-report-paradigm' },
  { signal: 'SQL 注入信号', lane: 'sqli-sql-injection' },
].map((r) => ({ ...r, path: `specialized/${r.lane}/SKILL.md` }))

// 2.3 把部分模块从 knowledge-base 挪到了 playbooks，另有一个旧版笔误。
// 程序解析 kbModule 时：先按 id 查 knowledgeBase，查不到再查这里。
// 这样 shared/fingerprints.ts、shared/vulnCatalog.ts 不必跟着改，也不怕以后再挪。
const MODULE_ALIASES = {
  'deserialization-test': 'playbooks/rce/12-deserialization.md',
  'path-traversal-lfi-test': 'playbooks/path-traversal/10-traversal-lfi.md',
  'spring-security-test': 'knowledge-base/authbypass-test.md',
}

const index = {
  schema: 1,
  bundled: true,
  source: '内置方法论包（精选，无外部路径）',
  skill: {
    name: manifest.name,
    version: manifest.version,
    displayName: manifest.display_name,
    workflow: manifest.architecture?.workflow ?? '',
    primaryLanes: manifest.architecture?.primary_lanes ?? 0,
  },
  safety: manifest.safety ?? {},
  evidenceGate: {
    requires: [
      '授权已确认且资产在范围内', '可复现的请求或观测', '对照/基线',
      '受影响的对象、身份、租户或业务状态', '明确的安全影响',
      '可安全回滚或清理', '证据已脱敏',
    ],
    rule: '线索不等于漏洞；上述任一项缺失即标记 incomplete 并说明下一个待决动作',
  },
  routing,
  moduleAliases: MODULE_ALIASES,
  rules: walk(path.join(SKILL, 'rules'), 'rules'),
  knowledgeBase: walk(path.join(SKILL, 'knowledge-base'), 'knowledge-base'),
  lanes: walk(path.join(SKILL, 'lanes'), 'lanes'),
  strategy: walk(path.join(SKILL, 'strategy'), 'strategy'),
  playbooks: walk(path.join(SKILL, 'playbooks'), 'playbooks'),
  specialized: walk(path.join(SKILL, 'specialized'), 'specialized'),
  templates: {
    report: read(path.join(SKILL, 'templates', 'report.md')),
    // 「创建文档」复制这个空白 docx 再改名；路径相对 skill/，程序里不得出现绝对路径
    reportDocx: 'templates/report-blank.docx',
    testMatrix: read(path.join(SKILL, 'templates', 'test-matrix.yaml')),
    assetQueue: read(path.join(SKILL, 'templates', 'asset-queue.yaml')),
  },
}

fs.writeFileSync(path.join(SKILL, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')

const counts = ['rules', 'knowledgeBase', 'lanes', 'strategy', 'playbooks', 'specialized']
  .map((k) => `${k}=${index[k].length}`).join('  ')
console.log('skill/index.json 已生成：', counts)
