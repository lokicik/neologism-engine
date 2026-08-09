// Deterministic smoke test for Auto's 70/10/10/10 presentation schedule.
import { mergeAutoBatches } from '../src/lib/auto'
import type { NameResult } from '../src/lib/engine'

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
