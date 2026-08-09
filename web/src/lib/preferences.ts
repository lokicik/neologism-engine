import type { NameResult, NamingMode } from './engine'

// Client-side preference learning. The profile stays transparent and tiny: it
// contrasts saved names with explicit passes (including their source naming
// mode), never sends either set anywhere, and is rebuilt locally whenever
// feedback changes.

const FRONT = new Set(['e', 'i', 'y'])
const BACK = new Set(['o', 'u'])
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])
const SHARP = new Set(['k', 't', 'x', 'z', 'q', 'v'])
const KNOWN_SUFFIXES = ['ify', 'ora', 'ium', 'io', 'ia', 'ix', 'ly', 'ai']
const ENGINE_QUALITY_WEIGHT = 1.1
const MIN_SHORTLIST_QUALITY = 0.75
const VISIBLE_PREFIX_SHARE = 0.2
export const MIN_TASTE_SIGNALS = 3
export const TASTE_POOL_MULTIPLIER = 6
export const MAX_TASTE_POOL = 60
export const MAX_TASTE_REFERENCES = 8

interface ShapeProfile {
  avgLength: number
  avgSyllables: number
  frontLean: number // share of (front - back) vowels, -1..1
  vowelEndRate: number
  sharpness: number
  compoundRate: number
  suffixes: Record<string, number>
  onsets: Record<string, number>
  bigrams: Record<string, number>
  modes: Record<string, number>
}

export interface PreferenceProfile {
  liked: ShapeProfile | null
  avoided: ShapeProfile | null
  likedCount: number
  rejectedCount: number
}

export interface ContextFeedback {
  favorites: NameResult[]
  rejected: NameResult[]
  scope: 'project' | 'legacy'
}

export interface ReferencedProfile {
  profile: PreferenceProfile | null
  references: NameResult[]
}

function letters(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

function frontLean(name: string): number {
  const chars = [...letters(name)]
  let front = 0
  let back = 0
  for (const c of chars) {
    if (FRONT.has(c)) front++
    else if (BACK.has(c)) back++
  }
  const total = front + back
  return total === 0 ? 0 : (front - back) / total
}

function sharpness(name: string): number {
  const chars = [...letters(name)]
  if (chars.length === 0) return 0
  return chars.filter((c) => SHARP.has(c)).length / chars.length
}

function isCompound(name: string): boolean {
  return /[a-z][A-Z]/.test(name)
}

function namingMode(item: NameResult): NamingMode | 'unknown' {
  if (item.sourceMode) return item.sourceMode
  return isCompound(item.name) ? 'compound' : 'unknown'
}

function suffix(name: string): string {
  const lower = letters(name)
  return KNOWN_SUFFIXES.find((ending) => lower.endsWith(ending)) ?? lower.slice(-2)
}

function onset(name: string): string {
  return letters(name).slice(0, 2)
}

function bigrams(name: string): string[] {
  const lower = letters(name)
  const grams: string[] = []
  for (let i = 0; i + 1 < lower.length; i++) grams.push(lower.slice(i, i + 2))
  return grams
}

export function parseTasteReferences(input: string): string[] {
  const seen = new Set<string>()
  const references: string[] = []
  for (const raw of input.split(/[,;\n]+/)) {
    const name = raw.trim().replace(/\s+/g, ' ')
    const key = letters(name)
    if (key.length < 3 || key.length > 20 || seen.has(key)) continue
    seen.add(key)
    references.push(name)
    if (references.length === MAX_TASTE_REFERENCES) break
  }
  return references
}

function estimatedSyllables(name: string): number {
  return Math.max(1, letters(name).match(/[aeiouy]+/g)?.length ?? 0)
}

function tasteReferenceResults(input: string): NameResult[] {
  return parseTasteReferences(input).map((name) => ({
    name,
    style: 'big_tech',
    syllables: estimatedSyllables(name),
    score_pronounce: 0,
    score_novelty: 0,
    score_memorability: 0,
    connotations: [],
  }))
}

function normalizedCounts(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) {
    if (value) counts[value] = (counts[value] ?? 0) + 1
  }
  const total = values.length || 1
  for (const value of Object.keys(counts)) counts[value] /= total
  return counts
}

function concentratedAffinity(counts: Record<string, number>, value: string): number {
  const rate = counts[value] ?? 0
  // Auto exposes Brandable more often than its accent modes. Treat a mode as
  // taste only when feedback clearly concentrates there, not from a normal
  // mixed batch whose source distribution is already imbalanced.
  return rate >= 0.75 ? rate : 0
}

function buildShapeProfile(items: NameResult[]): ShapeProfile {
  const n = items.length
  return {
    avgLength: items.reduce((sum, item) => sum + letters(item.name).length, 0) / n,
    avgSyllables: items.reduce((sum, item) => sum + item.syllables, 0) / n,
    frontLean: items.reduce((sum, item) => sum + frontLean(item.name), 0) / n,
    vowelEndRate: items.reduce(
      (sum, item) => sum + Number(VOWELS.has(letters(item.name).slice(-1))),
      0,
    ) / n,
    sharpness: items.reduce((sum, item) => sum + sharpness(item.name), 0) / n,
    compoundRate: items.reduce((sum, item) => sum + Number(isCompound(item.name)), 0) / n,
    suffixes: normalizedCounts(items.map((item) => suffix(item.name))),
    onsets: normalizedCounts(items.map((item) => onset(item.name))),
    bigrams: normalizedCounts(items.flatMap((item) => bigrams(item.name))),
    modes: normalizedCounts(items.map(namingMode)),
  }
}

// Keep live taste learning inside the project that produced the feedback. The
// v2 export already enforces this boundary for offline training; applying the
// same rule here prevents, for example, fantasy-name likes from reordering a
// developer-tool batch. Collections made before context tagging remain usable
// only while the whole collection is legacy/unscoped.
export function feedbackForContext(
  favorites: NameResult[],
  rejected: NameResult[],
  contextId: string,
): ContextFeedback {
  const hasScopedFeedback = favorites.some((item) => item.tasteContext)
    || rejected.some((item) => item.tasteContext)
  if (!hasScopedFeedback) return { favorites, rejected, scope: 'legacy' }

  return {
    favorites: favorites.filter((item) => item.tasteContext?.id === contextId),
    rejected: rejected.filter((item) => item.tasteContext?.id === contextId),
    scope: 'project',
  }
}

export function buildProfile(
  favorites: NameResult[],
  rejected: NameResult[] = [],
): PreferenceProfile | null {
  const liked = favorites.length >= MIN_TASTE_SIGNALS ? buildShapeProfile(favorites) : null
  // A positive centroid makes even one pass useful as a contrast. Without
  // likes, wait for three passes so an accidental click cannot define taste.
  const avoided = rejected.length >= (liked ? 1 : MIN_TASTE_SIGNALS)
    ? buildShapeProfile(rejected)
    : null
  if (!liked && !avoided) return null
  return {
    liked,
    avoided,
    likedCount: favorites.length,
    rejectedCount: rejected.length,
  }
}

// Explicit references such as "Vercel, Linear, Notion" are positive shape
// examples, not stored likes. Keep them out of feedback counts and exports,
// and avoid double-counting a name the user has also starred.
export function buildReferencedProfile(
  favorites: NameResult[],
  rejected: NameResult[],
  input: string,
): ReferencedProfile {
  const favoriteNames = new Set(favorites.map((item) => letters(item.name)))
  const references = tasteReferenceResults(input)
    .filter((item) => !favoriteNames.has(letters(item.name)))
  return {
    profile: buildProfile([...favorites, ...references], rejected),
    references,
  }
}

// Higher = closer to the learned profile. Continuous shape penalties prevent
// overfitting to one saved name; suffix/onset/bigram affinity captures recurring
// taste such as Nomix + Lexix -> short, front-vowel, -ix coinages.
function shapeSimilarity(name: NameResult, profile: ShapeProfile): number {
  const lower = letters(name.name)
  const lenDiff = Math.abs(lower.length - profile.avgLength) / 6
  const syllableDiff = Math.abs(name.syllables - profile.avgSyllables) / 2
  const leanDiff = Math.abs(frontLean(name.name) - profile.frontLean) * 0.45
  const vowelEndDiff = Math.abs(Number(VOWELS.has(lower.slice(-1))) - profile.vowelEndRate) * 0.4
  const sharpDiff = Math.abs(sharpness(name.name) - profile.sharpness) * 0.8
  const compoundDiff = Math.abs(Number(isCompound(name.name)) - profile.compoundRate) * 0.65

  const grams = bigrams(name.name)
  const bigramAffinity = grams.length === 0
    ? 0
    : grams.reduce((sum, gram) => sum + (profile.bigrams[gram] ?? 0), 0) / grams.length
  const suffixAffinity = profile.suffixes[suffix(name.name)] ?? 0
  const onsetAffinity = profile.onsets[onset(name.name)] ?? 0
  const modeAffinity = concentratedAffinity(profile.modes, namingMode(name))

  return suffixAffinity * 0.9
    + onsetAffinity * 0.25
    + bigramAffinity * 2.0
    + modeAffinity * 0.75
    - lenDiff
    - syllableDiff
    - leanDiff
    - vowelEndDiff
    - sharpDiff
    - compoundDiff
}

export function similarity(name: NameResult, profile: PreferenceProfile): number {
  const liked = profile.liked ? shapeSimilarity(name, profile.liked) : null
  if (!profile.avoided) return liked ?? 0

  // Compare the candidate with both centroids instead of applying an absolute
  // blacklist. The tanh bound prevents a narrow rejected cluster from
  // overpowering engine quality, while evidence scaling makes one accidental
  // pass a weak signal and five passes a full-strength signal.
  const avoided = shapeSimilarity(name, profile.avoided)
  const evidence = Math.min(1, profile.rejectedCount / 5)
  if (liked === null) return -Math.tanh(avoided) * evidence
  return liked + Math.tanh(liked - avoided) * evidence
}

function engineQuality(result: NameResult): number {
  return (
    0.4 * result.score_pronounce
    + 0.3 * result.score_memorability
    + 0.3 * result.score_novelty
  ) / 100
}

export function rankByPreference(results: NameResult[], profile: PreferenceProfile): NameResult[] {
  return results
    .map((result, index) => ({
      result,
      index,
      // Taste chooses among credible engine results; it should not pull a
      // structurally weak candidate into view solely because its shape fits.
      score: similarity(result, profile) + engineQuality(result) * ENGINE_QUALITY_WEIGHT,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ result }) => result)
}

// Once the user has taught us a real preference profile, give that judge
// enough alternatives to make a selection rather than merely reshuffling the
// same visible page. The cap keeps unusually large custom batches bounded.
export function preferencePoolCount(
  requested: number,
  profile: PreferenceProfile | null,
): number {
  const count = Math.max(0, Math.floor(requested))
  if (!profile || count === 0) return count
  return Math.max(count, Math.min(MAX_TASTE_POOL, count * TASTE_POOL_MULTIPLIER))
}

export function shortlistByPreference(
  results: NameResult[],
  profile: PreferenceProfile | null,
  requested: number,
): NameResult[] {
  const count = Math.max(0, Math.floor(requested))
  if (count === 0) return []
  if (!profile) return results.slice(0, count)

  const ranked = rankByPreference(results, profile)
  const qualified = ranked.filter((result) => engineQuality(result) >= MIN_SHORTLIST_QUALITY)
  const candidates = qualified.length >= count
    ? qualified
    : [...qualified, ...ranked.filter((result) => engineQuality(result) < MIN_SHORTLIST_QUALITY)]

  // The Rust generator caps one 3-letter stem family at 20% of a visible
  // batch. A larger personalization pool relaxes that cap internally, so
  // restore it after taste ranking instead of showing ten variants of one root.
  const prefixCap = Math.max(1, Math.ceil(count * VISIBLE_PREFIX_SHARE))
  const selected: NameResult[] = []
  const deferred: NameResult[] = []
  const prefixCounts = new Map<string, number>()
  for (const candidate of candidates) {
    const prefix = letters(candidate.name).slice(0, 3)
    if ((prefixCounts.get(prefix) ?? 0) >= prefixCap) {
      deferred.push(candidate)
      continue
    }
    selected.push(candidate)
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1)
    if (selected.length === count) return selected
  }

  // Tiny or heavily constrained pools may not contain enough families. Keep
  // the requested count rather than turning a diversity preference into false
  // exhaustion.
  selected.push(...deferred.slice(0, count - selected.length))
  return selected
}
