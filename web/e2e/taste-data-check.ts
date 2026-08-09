import { buildTasteDataset, TASTE_DATA_SCHEMA } from '../src/lib/taste-data.ts'
import type { NameResult, NamingMode } from '../src/lib/engine.ts'

function result(name: string, sourceMode?: NamingMode): NameResult {
  return {
    name,
    style: 'big_tech',
    sourceMode,
    syllables: 2,
    score_pronounce: 85,
    score_novelty: 90,
    score_memorability: 80,
    connotations: [],
  }
}

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(message)
  console.log(`PASS  ${message}`)
}

const dataset = buildTasteDataset(
  [result('Noma', 'realword'), result('Lexix', 'brandable')],
  [result('Bobbyn', 'respell'), result('EagerMythos', 'compound')],
  '2026-08-09T00:00:00.000Z',
)

check(dataset.schema === TASTE_DATA_SCHEMA, 'taste export carries a versioned schema')
check(dataset.exportedAt === '2026-08-09T00:00:00.000Z', 'taste export timestamp is explicit')
check(dataset.summary.liked === 2 && dataset.summary.passed === 2, 'taste labels are counted')
check(dataset.summary.comparisons === 4, 'two likes by two passes form four comparisons')
check(dataset.examples[0].result.sourceMode === 'realword', 'source modes survive the export')
check(
  JSON.stringify(dataset.comparisons) === JSON.stringify([[0, 2], [0, 3], [1, 2], [1, 3]]),
  'pair indices deterministically point from liked to passed examples',
)
check(!JSON.stringify(dataset).includes('apiKey'), 'taste export contains no AI credentials')

const oneSided = buildTasteDataset([result('Noma')], [], '2026-08-09T00:00:00.000Z')
check(oneSided.examples.length === 1 && oneSided.comparisons.length === 0, 'one-sided feedback still exports safely')
