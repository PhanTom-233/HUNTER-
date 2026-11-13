/**
 * 分发包启动器（由 start-hunter.bat 调用）
 *
 * 职责：
 *   1. 先探端口 —— 如果软件已经在跑，直接开浏览器，明确说「已在运行」，不再误报「已停止」
 *   2. 没在跑就拉起后端单文件，健康检查通过后打印成功信息并自动打开浏览器
 *   3. 端口被别的程序占用时，给出可执行的英文提示
 *
 * 约定：本文件只输出 ASCII，避免 Windows 控制台 GBK 代码页把中文打成乱码。
 * 退出码：0 = 正常运行后停止，2 = 本来就在运行，1 = 启动失败
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST = '127.0.0.1'
const PORT = Number(process.env.PORT ?? 3001)
const BASE = `http://localhost:${PORT}`
const ENTRY = path.join(ROOT, 'dist-server', 'server.bundle.cjs')
const NO_OPEN = process.env.HUNTER_NO_OPEN === '1'
const RULE = '='.repeat(60)
const THIN = '-'.repeat(60)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (line = '') => console.log(line)

function ownVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}

/** 探一次 /api/health；只有 HUNTER 自己会返回 { ok:true, data:{ status:'ok' } } */
function probe(timeoutMs = 900) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/api/health', timeout: timeoutMs }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          if (res.statusCode === 200 && json?.ok && json?.data?.status === 'ok') {
            resolve({ hunter: true, version: String(json.data.version ?? 'unknown') })
            return
          }
        } catch {
          /* 不是 HUNTER，继续走下面 */
        }
        resolve({ hunter: false, reason: `http ${res.statusCode}` })
      })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve({ hunter: false, reason: 'timeout' })
    })
    req.on('error', (err) => resolve({ hunter: false, reason: err.code ?? 'error' }))
  })
}

function openBrowser(url) {
  if (NO_OPEN) {
    say(`  (browser auto-open skipped: ${url})`)
    return
  }
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
    say('  A browser window should open automatically.')
    say(`  If it does not, copy this address:  ${BASE}`)
  } catch {
    say(`  Could not open a browser automatically. Please visit:  ${BASE}`)
  }
}

/** 失败时按住窗口，别让用户刚看到提示就消失 */
function waitForEnter(message) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve()
    process.stdout.write(message)
    process.stdin.resume()
    process.stdin.once('data', () => {
      process.stdin.pause()
      resolve()
    })
  })
}

say()
say(RULE)
say('  HUNTER  -  Penetration Test Workflow Manager')
say(RULE)
say()

// ---------- 1. 已经在跑？ ----------
const existing = await probe()
if (existing.hunter) {
  const mine = ownVersion()
  say(`  [OK] HUNTER is already running (v${existing.version}).`)
  say()
  say(`  Open in your browser:  ${BASE}`)
  if (mine && existing.version !== mine) {
    say()
    say(`  Note: the window that is open runs v${existing.version}, this package is v${mine}.`)
    say('  Close the old window first if you want to switch versions.')
  }
  say()
  openBrowser(BASE)
  say()
  say(THIN)
  say('  This window will close by itself. The app is running in its own window.')
  say(THIN)
  await sleep(2500)
  process.exit(2)
}

// ---------- 2. 启动 ----------
if (!fs.existsSync(ENTRY)) {
  say('  [X] Cannot start: dist-server/server.bundle.cjs is missing.')
  say()
  say('      The archive was probably not fully extracted.')
  say('      Extract the whole zip again, then double-click start-hunter.bat.')
  say()
  await waitForEnter('  Press Enter to close this window...')
  process.exit(1)
}

say('  [OK] Environment check passed. Starting HUNTER...')
say()

const child = spawn(process.execPath, [ENTRY], {
  cwd: ROOT,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, PORT: String(PORT) },
})

let ready = false
let childGone = false
let stopping = false

// Ctrl+C 时别让启动器先死，否则来不及打收尾提示；真正的落盘由服务端自己做
process.on('SIGINT', () => {
  stopping = true
  if (ready) say('\n  Stopping... saving your data, please wait.')
})
process.on('SIGBREAK', () => {
  stopping = true
  if (ready) say('\n  Stopping... saving your data, please wait.')
})

child.on('error', (err) => {
  say()
  say(`  [X] Could not start the server: ${err.message}`)
})

child.on('exit', async (code) => {
  childGone = true
  if (!ready) {
    const again = await probe(600)
    say()
    if (again.hunter) {
      // 极端情况：启动过程中被别人抢先启动了
      say('  [OK] HUNTER is already running.')
      say(`  Open in your browser:  ${BASE}`)
      openBrowser(BASE)
      process.exit(2)
    }
    if (again.reason === 'timeout' || again.reason === 'http 404' || /^http /.test(String(again.reason))) {
      say(`  [X] Port ${PORT} is already used by another program.`)
      say()
      say('      Close that program, or use a different port:')
      say(`        set PORT=3002`)
      say('        start-hunter.bat')
    } else {
      say(`  [X] HUNTER stopped unexpectedly (exit code ${code}).`)
      say('      See the messages above for details.')
    }
    say()
    await waitForEnter('  Press Enter to close this window...')
    process.exit(1)
  }
  say()
  say(RULE)
  say('  Software stopped. Your data has been saved.')
  say('  It is now safe to close this window.')
  say('  To use again: double-click start-hunter.bat')
  say(RULE)
  say()
  process.exit(0)
})

// ---------- 3. 等健康检查通过 ----------
const deadline = Date.now() + 25_000
while (!ready && !childGone && Date.now() < deadline) {
  await sleep(350)
  const r = await probe(600)
  if (r.hunter) {
    ready = true
    say()
    say(RULE)
    say(`  [OK] HUNTER started successfully.  v${r.version}`)
    say()
    say(`  Open in your browser:  ${BASE}`)
    say()
    openBrowser(BASE)
    say(THIN)
    say('  To stop the app: just close this black window.')
    say('  Your data is saved automatically when the window closes.')
    say('  (Ctrl+C also works. If Windows asks "Terminate batch job')
    say('   (Y/N)?", type Y - your data is already saved at that point.)')
    say('  To use the app again: double-click start-hunter.bat')
    say(RULE)
    say()
    break
  }
}

if (!ready && !childGone) {
  say()
  say(`  [X] The server did not answer on port ${PORT} within 25 seconds.`)
  say('      Close this window and try again. If it keeps happening,')
  say('      check whether a firewall or antivirus is blocking node.exe.')
  say()
  await waitForEnter('  Press Enter to close this window...')
  child.kill()
  process.exit(1)
}

// 等待服务端自己退出（正常关闭 / 用户关窗 / 用户按 Ctrl+C）
await new Promise((resolve) => child.once('close', resolve))
if (!childGone) process.exit(0)
