/**
 * 校验代码里对内置方法论包的引用是否都指向真实文件。
 * 防止「AI 编造一个看起来合理的 md 文件名」这类断链混进建议依据。
 * 纯 Node，无依赖：npm run check:refs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['src', 'server', 'shared']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-server'])
const errors = []
let counted = 0

function walk(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|js|mjs|json)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))

// 1) 所有 skill/....md 引用必须存在（允许尾部带 " §3" 之类的节号）
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  for (const m of text.matchAll(/skill\/[A-Za-z0-9_./-]+\.md/g)) {
    counted++
    const rel = m[0]
    if (!fs.existsSync(path.join(ROOT, rel))) {
      const line = text.slice(0, m.index).split('\n').length
      errors.push(`${path.relative(ROOT, file)}:${line}  不存在的引用  ${rel}`)
    }
  }
}

// 2) 指纹库 / 漏洞清单的 kbModule 必须能被 knowledgeBase 或 moduleAliases 解析
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'skill', 'index.json'), 'utf8'))
const known = new Set(index.knowledgeBase.map((x) => x.id))
for (const name of ['shared/fingerprints.ts', 'shared/vulnCatalog.ts']) {
  const file = path.join(ROOT, name)
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  for (const m of text.matchAll(/'([a-z0-9-]+-test)'/g)) {
    counted++
    const id = m[1]
    if (!known.has(id) && !index.moduleAliases[id]) {
      const line = text.slice(0, m.index).split('\n').length
      errors.push(`${name}:${line}  模块无法解析  ${id}`)
    }
  }
}

console.log(`检查 ${counted} 处引用，断链 ${errors.length} 处`)
if (errors.length) {
  for (const e of errors) console.log('  - ' + e)
  console.error('\n引用校验失败。改用 skill/ 里真实存在的文件，或在 skill/index.json 的 moduleAliases 加映射。')
  process.exitCode = 1
} else {
  console.log('全部指向真实文件。')
}
