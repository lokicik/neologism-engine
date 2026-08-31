import { composite } from './score'
import type { Explanation, NameResult } from './engine'

/// How many finalists a page argues for. Ten names is a gallery to scroll
/// past; three or four is a decision you can actually make. The rest of the
/// batch stays one click away.
export const SHORTLIST_SIZE = 4

const letters = (value: string): string => value.toLowerCase().replace(/[^a-z]/g, '')

/// How well can this name be argued for?
///
/// 0 - a full case: a story with its chain (Kule - the tower), or a coinage
///     whose halves both mean something (smal = small + tain = obtain).
/// 1 - half a case: a coinage whose tail is only a brand-canon ending, so the
///     decode reads "breeze + canon suffix" and says nothing about the second
///     syllable.
/// 2 - no case: the page can score the name but cannot say anything about it.
const advocacyTier = (result: NameResult): number => {
  if (!result.reasonChain) return 2
  return result.reasonChain.includes('canon suffix') ? 1 : 0
}

/// Finalists for the current batch, best first.
///
/// The ordering is the argument the page makes: a name it can explain beats a
/// name it can only score, an available name beats a taken one, and no two
/// finalists may share a construction or an opening — four variations on one
/// idea is one candidate wearing four hats.
export function pickShortlist(
  results: NameResult[],
  isTaken: (name: string) => boolean | undefined,
  size: number = SHORTLIST_SIZE,
): NameResult[] {
  if (results.length === 0) return []
  // Defensibility is a class above score, not a bonus on top of it. Six taste
  // rounds established that a high composite is not the same as a good name -
  // Buttehq scores 93 - so a name the page can argue for outranks any name it
  // can only measure, and only a thin batch falls back to score alone.
  const scored = results.map((result, index) => {
    const taken = isTaken(result.name)
    return {
      result,
      index,
      tier: advocacyTier(result),
      rank: composite(result) + (taken === false ? 4 : 0) - (taken === true ? 20 : 0),
    }
  })
  scored.sort((left, right) => (
    left.tier - right.tier
    || right.rank - left.rank
    || left.index - right.index
  ))

  const picked: NameResult[] = []
  const modeCounts = new Map<string, number>()
  const openings = new Set<string>()
  const take = (result: NameResult) => {
    const mode = result.sourceMode ?? 'brandable'
    picked.push(result)
    modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1)
    openings.add(letters(result.name).slice(0, 3))
  }

  // Two per construction: one is too strict (it hands the empty slots to
  // whatever lane is left, however weak), three is a page of variations on
  // one idea. Openings stay unique - Breecess beside Breevel is one
  // candidate wearing two hats.
  for (const { result, tier } of scored) {
    if (picked.length >= size || tier !== 0) continue
    const mode = result.sourceMode ?? 'brandable'
    if ((modeCounts.get(mode) ?? 0) >= 2) continue
    if (openings.has(letters(result.name).slice(0, 3))) continue
    take(result)
  }

  // A shortlist of names the page can argue for beats a longer one padded with
  // well-scored spellings, so the weaker tiers only fill up to a floor. The
  // second sub-pass drops the distinct-opening rule: a brief whose whole batch
  // shares one stem (Hostedvault, Hostedio, Hostedix) would otherwise leave a
  // single finalist, and one candidate is not a choice.
  const floor = Math.min(size, 3)
  for (const tierFloor of [1, 2]) {
    for (const requireDistinctOpening of [true, false]) {
      for (const { result, tier } of scored) {
        if (picked.length >= floor || tier !== tierFloor) continue
        if (picked.includes(result)) continue
        if (requireDistinctOpening && openings.has(letters(result.name).slice(0, 3))) continue
        take(result)
      }
    }
  }
  return picked
}

/// The one-line case for a finalist.
///
/// Prefers the engine's own chain (a story's path, or a coinage's decode).
/// Without one, the engine can still say how the name was built - the same
/// explanation the card's Why panel shows - and that is a truer case than a
/// list of adjectives.
export function advocacyFor(result: NameResult, explanation?: Explanation): string {
  if (result.reasonChain) return result.reasonChain
  const built: string[] = []
  if (explanation) {
    if (explanation.is_real_word) built.push('a real English word')
    if (explanation.prefix_word) built.push(`opens with “${explanation.prefix_word}”`)
    if (explanation.suffix && explanation.stem) {
      built.push(`“${explanation.stem}” + brandable “-${explanation.suffix}”`)
    }
  }
  const shape = result.syllables === 1
    ? 'one syllable'
    : `${result.syllables} syllables`
  const traits = result.connotations.slice(0, 2).join(', ')
  built.push(traits ? `${shape} · ${traits}` : shape)
  return built.join(' · ')
}

/// Where a name has to survive: the places it will be read before anyone
/// decides they like it.
export function contextsFor(name: string): { label: string; text: string }[] {
  const handle = letters(name)
  return [
    { label: 'install', text: `cargo add ${handle}` },
    { label: 'repo', text: `github.com/you/${handle}` },
    { label: 'import', text: `import { run } from '${handle}'` },
  ]
}
