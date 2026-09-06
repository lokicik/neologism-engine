import type { Config, NameResult } from './engine'
import type { CandidateTrace } from './candidate-pool'

export interface NamingRequest {
  config: Config
  target: 'product_name'
  interpretation_override?: string | null
  direction?: string | null
  data_identity?: string | null
}
export interface ProductJob { id: string; domain: string; label: string; object: string; operation: string; directions: string[] }
export interface ConceptSource {
  concept_id: string; direction: string; rank: number; sense: string; benefit: string
  provenance: string; construction: 'whole_lexeme' | 'complete_compound'; components: string[]; rejection: string | null
}
export interface ConceptCandidate {
  id: string; result: NameResult; sources: ConceptSource[]; rejection: string | null
  pronunciation: { source: 'dictionary' | 'dictionary_components' | 'missing'; syllables: number | null; components: { word: string; phones: string | null; source_sha256: string }[] }
  collisions: { source: 'brand_corpus' | 'crate_snapshot'; sha256: string; snapshot_date: string | null; match: boolean }[]
}
export interface ConceptRun {
  schema: 'concept-naming-run-v1'; request: NamingRequest; data_identity: string; data_sources: Record<string, {sha256: string; snapshot_date: string | null}>
  meaning: { status: 'ready' | 'ambiguous' | 'unsupported'; reason: string | null; description: string; job: ProductJob | null; options: ProductJob[]
    evidence_spans: {surface: string; start: number; end: number; role: string}[]; interpretation_rule: string | null }
  directions: {id: string; benefit: string}[]; direction_order: string[]
  candidates: ConceptCandidate[]; finalists: {id: string; concept_id: string; direction: string}[]
  trace: (Omit<CandidateTrace, 'stage'> & {stage: CandidateTrace['stage'] | 'interpretation'})[]; exhausted: boolean
  durationMs?: number
}
export async function generateConceptNames(request: NamingRequest): Promise<ConceptRun> {
  const input = {...request, config: {...request.config, seed: request.config.seed ?? 13}}
  if (!Number.isInteger(input.config.seed) || input.config.seed < 0 || input.config.seed > 0xffffffff) throw new Error('Seed must be a 32-bit unsigned integer.')
  const { conceptDiagnostics } = await import('./engine')
  const start = performance.now()
  const run = await conceptDiagnostics(input)
  return {...run, durationMs: performance.now() - start}
}
export function collisionLabel(candidate: ConceptCandidate): string {
  if (candidate.collisions.some(c => c.source === 'brand_corpus' && c.match)) return 'Known brand snapshot match'
  return candidate.collisions.some(c => c.source === 'crate_snapshot' && c.match)
    ? 'Crate snapshot match · product-name availability unverified'
    : 'No local snapshot match · availability unverified'
}
