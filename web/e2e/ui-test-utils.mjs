import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

export async function runUiTest(port, test) {
  const web = dirname(dirname(fileURLToPath(import.meta.url)))
  const server = spawn(process.execPath, [join(web, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: web, stdio: 'pipe', windowsHide: true })
  let browser
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Dev server timed out')), 20000); server.stdout.on('data', data => { if (data.toString().includes(String(port))) { clearTimeout(timer); resolve() } }); server.on('exit', () => { clearTimeout(timer); reject(new Error('Dev server exited')) }) })
    browser = await chromium.launch()
    let count = 0
    const check = (value, label) => { assert(value, label); count++; console.log('PASS ' + label) }
    await test({ browser, url: `http://127.0.0.1:${port}`, check })
    console.log(`PASS ${count} checks`)
  } finally { await browser?.close(); server.kill() }
}
