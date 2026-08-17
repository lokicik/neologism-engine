import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBlindStudy } from './study-tools.mjs'
import protocol from './protocol.json' with { type: 'json' }

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIST = resolve(HERE, '.collector-dist')

function fail(message) {
  throw new Error(message)
}

function args(argv) {
  if (argv.length % 2 !== 0) fail(`invalid argument near ${argv.at(-1)}`)
  const parsed = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !value || parsed.has(flag.slice(2))) fail(`invalid argument near ${flag}`)
    parsed.set(flag.slice(2), value)
  }
  const unknown = [...parsed.keys()].filter((key) => !['study', 'dist', 'out'].includes(key))
  if (unknown.length > 0) fail(`unknown argument --${unknown[0]}`)
  if (!parsed.has('study') || !parsed.has('out')) fail('usage: pack-evaluator.mjs --study FILE --out FILE [--dist DIR]')
  return {
    study: resolve(parsed.get('study')),
    dist: resolve(parsed.get('dist') ?? DEFAULT_DIST),
    out: resolve(parsed.get('out')),
  }
}

function assetPath(dist, url) {
  if (!url.startsWith('/assets/') || url.includes('\\')) fail(`unexpected evaluator asset path ${url}`)
  const path = resolve(dist, url.slice(1))
  const inside = relative(dist, path)
  if (inside.startsWith('..') || isAbsolute(inside) || path === dist) fail(`asset escapes evaluator build: ${url}`)
  return path
}

function exactMatch(html, expression, label) {
  const matches = [...html.matchAll(expression)]
  if (matches.length !== 1) fail(`built evaluator must contain exactly one ${label}`)
  return matches[0]
}

function safeJsonForScript(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

export async function packEvaluator({ study: studyPath, dist, out }) {
  if (existsSync(out)) fail('evaluator kit output already exists; refusing to overwrite evidence')
  let rawStudy
  try { rawStudy = JSON.parse(await readFile(studyPath, 'utf8')) } catch (error) { fail(`study is not valid JSON: ${error.message}`) }
  const { study } = validateBlindStudy(rawStudy, protocol)

  const htmlPath = resolve(dist, 'evaluator.html')
  let html
  try { html = await readFile(htmlPath, 'utf8') } catch (error) { fail(`built evaluator is unavailable: ${error.message}`) }
  const script = exactMatch(html, /<script type="module" crossorigin src="([^"]+)"><\/script>/g, 'module script')
  const stylesheet = exactMatch(html, /<link rel="stylesheet" crossorigin href="([^"]+)">/g, 'stylesheet')
  const preload = exactMatch(html, /<link rel="modulepreload" crossorigin href="([^"]+)">/g, 'module preload')

  let javascript = await readFile(assetPath(dist, script[1]), 'utf8')
  const css = await readFile(assetPath(dist, stylesheet[1]), 'utf8')
  const importedPreload = /^import"\.\/modulepreload-polyfill-[^"]+\.js";/
  if (!importedPreload.test(javascript)) fail('built evaluator module has an unexpected dependency graph')
  javascript = javascript.replace(importedPreload, '')
  if (/<\/script/i.test(javascript) || /<\/style/i.test(css)) fail('built assets cannot be safely inlined')

  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">'
  const embedded = `<script id="bundled-study" type="application/json">${safeJsonForScript(study)}</script>`
  html = html
    .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${csp}\n    <meta name="neologism-study-sha256" content="${study.studySha256}" />`)
    .replace(script[0], `${embedded}\n    <script type="module">${javascript}</script>`)
    .replace(preload[0], '')
    .replace(stylesheet[0], `<style>${css}</style>`)
  if (/\/(?:assets)\//.test(html) || !html.includes(study.studySha256)) fail('packed evaluator still has an external asset or lost its study identity')

  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, html, { flag: 'wx' })
  return { out, studySha256: study.studySha256, bytes: Buffer.byteLength(html) }
}

async function main() {
  const result = await packEvaluator(args(process.argv.slice(2)))
  console.log(JSON.stringify(result, null, 2))
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? 'missing')) {
  main().catch((error) => {
    console.error(`evaluator pack error: ${error.message}`)
    process.exitCode = 1
  })
}
