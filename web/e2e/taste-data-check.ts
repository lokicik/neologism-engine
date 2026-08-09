import { buildTasteDataset, TASTE_DATA_SCHEMA } from '../src/lib/taste-data.ts'
import type { NameResult, NamingMode } from '../src/lib/engine.ts'
import { tasteContextForConfig } from '../src/lib/taste-context.ts'

function result(name: string, sourceMode?: NamingMode, contextId?: string): NameResult {
  return {
    name,
    style: 'big_tech',
    sourceMode,
    tasteContext: contextId ? { id: contextId, description: contextId, roots: [] } : undefined,
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
  [result('Noma', 'realword', 'project-a'), result('Lexix', 'brandable', 'project-b')],
  [result('Bobbyn', 'respell', 'project-a'), result('EagerMythos', 'compound', 'project-b')],
  '2026-08-09T00:00:00.000Z',
)

check(dataset.schema === TASTE_DATA_SCHEMA, 'taste export carries a versioned schema')
check(dataset.exportedAt === '2026-08-09T00:00:00.000Z', 'taste export timestamp is explicit')
check(dataset.summary.liked === 2 && dataset.summary.passed === 2, 'taste labels are counted')
check(dataset.summary.comparisons === 2, 'feedback pairs only within the same project context')
check(dataset.summary.contexts === 2, 'taste export counts distinct project contexts')
check(dataset.examples[0].result.sourceMode === 'realword', 'source modes survive the export')
check(
  JSON.stringify(dataset.comparisons) === JSON.stringify([[0, 2], [1, 3]]),
  'pair indices deterministically point from liked to passed examples',
)
check(!JSON.stringify(dataset).includes('apiKey'), 'taste export contains no AI credentials')

const oneSided = buildTasteDataset([result('Noma')], [], '2026-08-09T00:00:00.000Z')
check(oneSided.examples.length === 1 && oneSided.comparisons.length === 0, 'one-sided feedback still exports safely')

const legacy = buildTasteDataset(
  [result('OldLike')],
  [result('OldPass'), result('ScopedPass', 'brandable', 'project-a')],
  '2026-08-09T00:00:00.000Z',
)
check(
  JSON.stringify(legacy.comparisons) === JSON.stringify([[0, 1]]) && legacy.summary.contexts === 2,
  'legacy feedback stays comparable only inside its own unscoped bucket',
)

const normalizedContext = tasteContextForConfig({
  style: 'big_tech',
  description: '  Secure   Developer Tools  ',
  roots: ['Forge', 'code', 'FORGE'],
  count: 10,
  temperature: 0.3,
  variant: 'realword',
})
const equivalentContext = tasteContextForConfig({
  style: 'big_tech',
  description: 'secure developer tools',
  roots: [' CODE ', 'forge'],
  count: 100,
  temperature: 0.9,
  variant: 'respell',
  starts_with: 'n',
})
check(
  normalizedContext.id === equivalentContext.id && JSON.stringify(normalizedContext.roots) === '["code","forge"]',
  'cosmetic brief changes and generation controls preserve the project context',
)
check(
  tasteContextForConfig({ style: 'fantasy', description: 'secure developer tools', roots: ['code', 'forge'] }).id
    !== equivalentContext.id,
  'a naming-style change creates a distinct project context',
)
