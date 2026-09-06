// Assistant editorial judgments. Source-visible, first fixed seed, not blind,
// not human evidence, not training labels and never consumed by generation.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const out = resolve(import.meta.dirname, 'artifacts')
const source = JSON.parse(readFileSync(resolve(out, 'comparison.json'))).rows.filter((r) => r.partition === 'evaluation' && r.seed === 13)
const judgments = [
  ['neither', [], [], 'DetectLeak reads as a function; the metaphors are broad for leaked credentials. The Auto list is also weak.'],
  ['new', ['Ostraka'], [], 'A record-keeping metaphor is a plausible brand for recording migration timings, though the timing aspect remains indirect.'],
  ['new', ['Terazi', 'Kiyas'], [], 'Comparison is represented clearly through weighing or analogy; the old names mostly describe unrelated technical context.'],
  ['new', ['Vercache', 'Mihenk'], ['Sarraf'], 'Vercache gives a more specific cache-verification construction; both arms also have a usable verification metaphor.'],
  ['tie', ['Izci'], ['Izci'], 'Both surface the same tracking metaphor. Literal socket blends add no clear aesthetic advantage.'],
  ['new', ['Halka'], [], 'Halka provides a grouping metaphor. GroupWarning is descriptive, not an additional brand choice for me.'],
  ['tie', ['Portolan', 'Harita'], ['Harita'], 'Both have a usable mapping name. Portolan is an alternative, not sufficient evidence of an overall preference win.'],
  ['neither', [], [], 'CheckKey is a function label; Plumbline is too broad for translation keys. The old candidates are also weak.'],
  ['tie', ['Mizan'], ['Mizan'], 'Both retain the balance/measurement metaphor; Measureloss is not a stronger brand.'],
  ['neither', [], [], 'Destore can suggest destruction, and Constore suggests generic storage. Literal ancestry has not guaranteed the intended restore meaning.'],
  ['new', ['Valka'], [], 'The recorded chooser/select/filter metaphor is a plausible concise name. Filterbuild remains a literal label.'],
  ['neither', [], [], 'SortReport is a function label; the old names do not offer a convincing crash-report sorting brand either.'],
]
assert.equal(source.length, judgments.length)
const rows = source.map((r, i) => {
  const [preference, usableNew, usableAuto, rationale] = judgments[i]
  assert(usableNew.every((n) => r.current.includes(n)) && usableAuto.every((n) => r.auto.includes(n)))
  return { brief: r.brief, seed: r.seed, auto: r.auto, current: r.current, preference, usableNew, usableAuto, rationale }
})
const summary = { newWins: rows.filter((r) => r.preference === 'new').length, autoWins: rows.filter((r) => r.preference === 'auto').length,
  ties: rows.filter((r) => r.preference === 'tie').length, neither: rows.filter((r) => r.preference === 'neither').length,
  usableNewBriefs: rows.filter((r) => r.usableNew.length).length, usableAutoBriefs: rows.filter((r) => r.usableAuto.length).length }
writeFileSync(resolve(out, 'assistant-review.json'), JSON.stringify({ evaluator: 'assistant', sourceVisible: true, humanEvidence: false, generationInput: false, summary, rows }, null, 2), { flag: 'wx' })
console.log(JSON.stringify(summary))
