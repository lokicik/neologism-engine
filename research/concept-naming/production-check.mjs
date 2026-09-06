import assert from 'node:assert/strict'
import { readFileSync,writeFileSync,readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
import { hash,root } from '../shared-pool/harness.mjs'
const out=resolve(import.meta.dirname,'artifacts'),assets=resolve(root,'web/dist/assets'),frozen=JSON.parse(readFileSync(resolve(out,'frozen.json')))
const wasm=readdirSync(assets).find(f=>f.endsWith('.wasm'));assert(wasm)
assert.equal(hash(readFileSync(resolve(assets,wasm))),frozen.wasmSha256)
const browser=await chromium.launch()
try {
  const context=await browser.newContext(),page=await context.newPage(),requests=[],errors=[]
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(String(e)))
  await page.goto('http://127.0.0.1:4247')
  await page.getByRole('button',{name:/Open app/}).click()
  await page.getByRole('button',{name:/Product names/}).click()
  const gen=async brief=>{await page.getByRole('textbox',{name:'Project brief'}).fill(brief);await page.getByRole('button',{name:'Generate',exact:true}).click();await page.waitForFunction(brief=>document.querySelector('.product-names-lab')?.getAttribute('data-brief')===brief&&document.querySelector('.product-names-lab')?.getAttribute('aria-busy')==='false',brief)}
  await gen('a CLI for database migrations');assert.equal(await page.locator('.finalist').count(),4)
  await context.setOffline(true)
  await gen('a signature verifier');assert.equal(await page.locator('.finalist').count(),4)
  assert.match(await page.locator('.product-names-lab').innerText(),/Touchstone/)
  assert(requests.filter(u=>/^https?:/.test(u)).every(u=>new URL(u).hostname==='127.0.0.1'))
  assert.deepEqual(errors,[])
  writeFileSync(resolve(out,'production-verification.json'),JSON.stringify({passed:true,builtWasmMatchesFreeze:true,firstLoad:true,offlineGenerationAfterLoad:true,externalRequests:0,pageErrors:0,origin:'http://127.0.0.1:4247'},null,2)+'\n')
}finally{await browser.close()}
console.log('PASS production bundle first load and offline generation after load; no external requests.')
