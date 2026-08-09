// Deterministic smoke test for Auto's brief-aware presentation schedule.
import { autoModeCounts, mergeAutoBatches } from '../src/lib/auto.ts'
import type { NameResult } from '../src/lib/engine.ts'

function result(name: string): NameResult {
  return {
    name,
    style: 'big_tech',
    syllables: 2,
    score_pronounce: 80,
    score_novelty: 80,
    score_memorability: 80,
    connotations: [],
  }
}

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(message)
  console.log(`PASS  ${message}`)
}

const brandable = Array.from({ length: 7 }, (_, index) => result(`Brand${index}`))
const merged = mergeAutoBatches(
  [brandable, [result('Real')], [result('Respell')], [result('Compound')]],
  10,
)

check(merged.length === 10, 'Auto keeps the requested batch size')
check(merged.filter((item) => item.name.startsWith('Brand')).length === 7, 'Auto keeps seven Brandable names')
check(merged[0].name === 'Brand0' && merged[1].name === 'Brand1', 'Auto opens with two Brandable names')
check(merged.slice(2).some((item) => item.name === 'Real'), 'accent modes remain represented')

const deduped = mergeAutoBatches([[result('Nomix')], [result('nomix')], [], []], 2)
check(deduped.length === 1, 'Auto removes case-insensitive cross-mode duplicates')

const guided = autoModeCounts(10, true)
check(
  guided.brandable === 7 && guided.realword === 1 && guided.respell === 1 && guided.compound === 1,
  'a product brief keeps the 70/10/10/10 semantic mix',
)

const generic = autoModeCounts(10, false)
check(
  generic.brandable === 5 && generic.realword === 3 && generic.respell === 1 && generic.compound === 1,
  'an empty brief uses a safer 50/30/10/10 mix',
)

const tiny = autoModeCounts(3, false)
check(tiny.brandable === 3 && tiny.realword === 0, 'tiny batches stay entirely Brandable')
