/**
 * 把编译后的后端连同 express 打成一个单文件，供「解压即用」分发包使用。
 * 产物 dist-server/server.bundle.cjs 可以用 `node` 直接跑，不需要 node_modules。
 * 需要先执行 npm run build。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = path.join(ROOT, 'dist-server', 'server', 'index.js')
const OUT = path.join(ROOT, 'dist-server', 'server.bundle.cjs')

if (!fs.existsSync(ENTRY)) {
  console.error('找不到 dist-server/server/index.js，请先跑 npm run build')
  process.exit(1)
}

const require = createRequire(import.meta.url)
let esbuild
try {
  esbuild = require('esbuild')
} catch {
  console.error('找不到 esbuild，请先跑 npm install')
  process.exit(1)
}

await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: OUT,
  logLevel: 'warning',
})

console.log(`已生成 ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`)
