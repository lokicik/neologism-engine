import type { NameResult } from './engine'

// Client-side preference learning (Namelix-style adaptive ranking). Builds a
// profile from the user's favorites and scores how well a name fits it, so
// results can be re-ranked toward what they've liked. Engineering, not a paper.

const FRONT = new Set(['e', 'i', 'y'])
const BACK = new Set(['o', 'u'])

export interface PreferenceProfile {
  avgLength: number
  avgSyllables: number
  frontLean: number // share of (front - back) vowels, -1..1
}

function frontLean(name: string): number {
  const chars = [...name.toLowerCase()]
  let front = 0
  let back = 0
  for (const c of chars) {
    if (FRONT.has(c)) front++
    else if (BACK.has(c)) back++
  }
  const total = front + back
  return total === 0 ? 0 : (front - back) / total
}

export function buildProfile(favorites: NameResult[]): PreferenceProfile | null {
  if (favorites.length < 3) return null
  const n = favorites.length
  return {
    avgLength: favorites.reduce((s, f) => s + f.name.length, 0) / n,
    avgSyllables: favorites.reduce((s, f) => s + f.syllables, 0) / n,
    frontLean: favorites.reduce((s, f) => s + frontLean(f.name), 0) / n,
  }
}

// Higher = closer to the profile. Used as a sort key (relative, not absolute).
export function similarity(name: NameResult, p: PreferenceProfile): number {
  const lenDiff = Math.abs(name.name.length - p.avgLength) / 8
  const sylDiff = Math.abs(name.syllables - p.avgSyllables) / 3
  const leanDiff = Math.abs(frontLean(name.name) - p.frontLean)
  return -(lenDiff + sylDiff + leanDiff)
}

export function rankByPreference(results: NameResult[], p: PreferenceProfile): NameResult[] {
  return [...results].sort((a, b) => similarity(b, p) - similarity(a, p))
}
