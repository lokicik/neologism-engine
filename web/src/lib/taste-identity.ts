import type { NameResult } from './engine'
import { isWellFormedUnicode } from './unicode.ts'

export function normalizedName(item: NameResult): string {
  return item.name.trim().toLowerCase().normalize('NFC')
}

// Before imported share names had their own collection, App's share branch
// emitted exactly these zero-value rows. Ordinary nonzero legacy likes keep
// their historical unscoped identity.
export function isLegacyShareStub(item: unknown): item is NameResult {
  if (typeof item !== 'object' || item === null) return false
  const row = item as Record<string, unknown>
  const expectedKeys = [
    'connotations',
    'name',
    'score_memorability',
    'score_novelty',
    'score_pronounce',
    'style',
    'syllables',
  ]
  const keys = Object.keys(row).sort()
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && typeof row.name === 'string'
    && row.name.trim().length > 0
    && row.name.trim().length <= 80
    && !/[\u0000-\u001f\u007f]/.test(row.name)
    && isWellFormedUnicode(row.name)
    && (row.style === 'big_tech' || row.style === 'sci_fi' || row.style === 'fantasy')
    && row.syllables === 0
    && row.score_pronounce === 0
    && row.score_novelty === 0
    && row.score_memorability === 0
    && Array.isArray(row.connotations)
    && row.connotations.length === 0
}

export interface LegacyShareMigration {
  favorites: NameResult[]
  recoveredImported: NameResult[]
}

export function migrateLegacyShareRows(
  stored: NameResult[],
  existingImported: NameResult[],
  writeImported: (items: NameResult[]) => void,
  writeExplicit: (items: NameResult[]) => void,
): LegacyShareMigration {
  const imported = stored.filter(isLegacyShareStub)
  if (imported.length === 0) return { favorites: stored, recoveredImported: [] }
  const explicit = stored.filter((item) => !isLegacyShareStub(item))

  // Write imported-first. If that fails, leave the durable old collection
  // untouched while projecting the recovered rows as imported-only Saved
  // names for this session. If the second write fails, the Saved union still
  // dedupes the temporary two-key copy and a later load can retry safely.
  try {
    writeImported(mergeSavedNames(existingImported, imported))
  } catch {
    return { favorites: explicit, recoveredImported: imported }
  }
  try {
    writeExplicit(explicit)
  } catch {
    // retry on a later load
  }
  return { favorites: explicit, recoveredImported: [] }
}

// Explicit taste belongs to one project. Legacy records without a context
// remain comparable inside their historical unscoped bucket, but never collide
// with a scoped action that happens to use the same spelling.
export function tasteIdentity(item: NameResult): string {
  return JSON.stringify([
    item.tasteContext?.id ?? null,
    normalizedName(item),
  ])
}

export function sameTasteItem(a: NameResult, b: NameResult): boolean {
  return tasteIdentity(a) === tasteIdentity(b)
}

export function hasTasteItem(items: NameResult[], item: NameResult): boolean {
  const identity = tasteIdentity(item)
  return items.some((candidate) => tasteIdentity(candidate) === identity)
}

export function withoutTasteItem(items: NameResult[], item: NameResult): NameResult[] {
  return items.filter((candidate) => !sameTasteItem(candidate, item))
}

export type TasteLabel = 'favorite' | 'rejected'

export interface TasteToggleResult {
  favorites: NameResult[]
  rejected: NameResult[]
  persisted: boolean
  rollbackFailed: boolean
}

// A like/pass switch spans two localStorage keys. Remove the old label first,
// then add the new label; if that second write fails, restore the old label.
// A failed rollback is reported as a neutral durable state rather than
// pretending the original signal still exists or leaving both labels active.
export function toggleTasteRows(
  favorites: NameResult[],
  rejected: NameResult[],
  item: NameResult,
  label: TasteLabel,
  writeFavorites: (items: NameResult[]) => void,
  writeRejected: (items: NameResult[]) => void,
  maxRejected = 200,
): TasteToggleResult {
  const wasFavorite = hasTasteItem(favorites, item)
  const wasRejected = hasTasteItem(rejected, item)
  let nextFavorites = favorites
  let nextRejected = rejected

  if (label === 'favorite') {
    nextFavorites = wasFavorite
      ? withoutTasteItem(favorites, item)
      : [...favorites, item]
    if (!wasFavorite && wasRejected) nextRejected = withoutTasteItem(rejected, item)
  } else {
    nextRejected = wasRejected
      ? withoutTasteItem(rejected, item)
      : [...rejected, item].slice(-Math.max(1, maxRejected))
    if (!wasRejected && wasFavorite) nextFavorites = withoutTasteItem(favorites, item)
  }

  const favoritesChanged = nextFavorites !== favorites
  const rejectedChanged = nextRejected !== rejected

  if (favoritesChanged && !rejectedChanged) {
    try {
      writeFavorites(nextFavorites)
      return { favorites: nextFavorites, rejected, persisted: true, rollbackFailed: false }
    } catch {
      return { favorites, rejected, persisted: false, rollbackFailed: false }
    }
  }
  if (rejectedChanged && !favoritesChanged) {
    try {
      writeRejected(nextRejected)
      return { favorites, rejected: nextRejected, persisted: true, rollbackFailed: false }
    } catch {
      return { favorites, rejected, persisted: false, rollbackFailed: false }
    }
  }

  if (label === 'favorite') {
    // passed -> liked: remove the pass, then add the like
    try {
      writeRejected(nextRejected)
    } catch {
      return { favorites, rejected, persisted: false, rollbackFailed: false }
    }
    try {
      writeFavorites(nextFavorites)
      return {
        favorites: nextFavorites,
        rejected: nextRejected,
        persisted: true,
        rollbackFailed: false,
      }
    } catch {
      try {
        writeRejected(rejected)
        return { favorites, rejected, persisted: false, rollbackFailed: false }
      } catch {
        return {
          favorites,
          rejected: nextRejected,
          persisted: false,
          rollbackFailed: true,
        }
      }
    }
  }

  // liked -> passed: remove the like, then add the pass
  try {
    writeFavorites(nextFavorites)
  } catch {
    return { favorites, rejected, persisted: false, rollbackFailed: false }
  }
  try {
    writeRejected(nextRejected)
    return {
      favorites: nextFavorites,
      rejected: nextRejected,
      persisted: true,
      rollbackFailed: false,
    }
  } catch {
    try {
      writeFavorites(favorites)
      return { favorites, rejected, persisted: false, rollbackFailed: false }
    } catch {
      return {
        favorites: nextFavorites,
        rejected,
        persisted: false,
        rollbackFailed: true,
      }
    }
  }
}

export function sameSavedName(a: NameResult, b: NameResult): boolean {
  return normalizedName(a) === normalizedName(b)
}

export function withoutSavedName(items: NameResult[], item: NameResult): NameResult[] {
  return items.filter((candidate) => !sameSavedName(candidate, item))
}

export interface SavedRemoval {
  favorites: NameResult[]
  importedSaved: NameResult[]
  removed: boolean
}

export function removeSavedRows(
  favorites: NameResult[],
  importedSaved: NameResult[],
  item: NameResult,
  writeImported: (items: NameResult[]) => void,
  writeFavorites: (items: NameResult[]) => void,
): SavedRemoval {
  const nextFavorites = withoutSavedName(favorites, item)
  const nextImported = withoutSavedName(importedSaved, item)
  const removesFavorites = nextFavorites.length !== favorites.length
  const removesImported = nextImported.length !== importedSaved.length

  if (!removesFavorites && !removesImported) {
    return { favorites, importedSaved, removed: false }
  }

  // A single-source card needs only one durable write. Avoid turning an
  // unrelated storage failure into a rollback path that can lose its sole
  // copy.
  if (!removesFavorites) {
    try {
      writeImported(nextImported)
      return { favorites, importedSaved: nextImported, removed: true }
    } catch {
      return { favorites, importedSaved, removed: false }
    }
  }
  if (!removesImported) {
    try {
      writeFavorites(nextFavorites)
      return { favorites: nextFavorites, importedSaved, removed: true }
    } catch {
      return { favorites, importedSaved, removed: false }
    }
  }

  // Imported-first means a failed first write leaves all durable state alone.
  // If the second write fails, restore the imported collection and report a
  // visible failure instead of claiming a partial delete.
  try {
    writeImported(nextImported)
  } catch {
    return { favorites, importedSaved, removed: false }
  }
  try {
    writeFavorites(nextFavorites)
  } catch {
    try {
      writeImported(importedSaved)
    } catch {
      // The explicit record still keeps the card visible, but the imported
      // provenance is durably gone. Reflect that partial state honestly.
      return { favorites, importedSaved: nextImported, removed: false }
    }
    return { favorites, importedSaved, removed: false }
  }
  return {
    favorites: nextFavorites,
    importedSaved: nextImported,
    removed: true,
  }
}

export interface SavedNameEntry {
  result: NameResult
  explicitLikes: number
  scopedProjects: number
  legacyLiked: boolean
  imported: boolean
}

// Saved is one card per spelling, but keep enough source metadata to explain
// whether that card came from explicit project likes, a shared link, or both.
export function savedNameEntries(
  favorites: NameResult[],
  importedSaved: NameResult[],
): SavedNameEntry[] {
  const entries = new Map<
    string,
    SavedNameEntry & { tasteKeys: Set<string>; scopedIds: Set<string> }
  >()

  for (const item of favorites) {
    const name = normalizedName(item)
    const existing = entries.get(name)
    if (existing) {
      existing.tasteKeys.add(tasteIdentity(item))
      existing.explicitLikes = existing.tasteKeys.size
      if (item.tasteContext) existing.scopedIds.add(item.tasteContext.id)
      else existing.legacyLiked = true
      existing.scopedProjects = existing.scopedIds.size
    } else {
      const scopedIds = new Set<string>()
      if (item.tasteContext) scopedIds.add(item.tasteContext.id)
      entries.set(name, {
        result: item,
        explicitLikes: 1,
        scopedProjects: scopedIds.size,
        legacyLiked: !item.tasteContext,
        imported: false,
        tasteKeys: new Set([tasteIdentity(item)]),
        scopedIds,
      })
    }
  }

  for (const item of importedSaved) {
    const name = normalizedName(item)
    const existing = entries.get(name)
    if (existing) {
      existing.imported = true
    } else {
      entries.set(name, {
        result: item,
        explicitLikes: 0,
        scopedProjects: 0,
        legacyLiked: false,
        imported: true,
        tasteKeys: new Set(),
        scopedIds: new Set(),
      })
    }
  }

  return [...entries.values()].map(({
    tasteKeys: _tasteKeys,
    scopedIds: _scopedIds,
    ...entry
  }) => entry)
}

// Saved is a spelling collection, not an evidence table. Prefer the first
// record so callers can place explicit, fully-scored likes before share stubs.
export function mergeSavedNames(...collections: NameResult[][]): NameResult[] {
  const merged: NameResult[] = []
  const seen = new Set<string>()
  for (const collection of collections) {
    for (const item of collection) {
      const name = normalizedName(item)
      if (seen.has(name)) continue
      seen.add(name)
      merged.push(item)
    }
  }
  return merged
}
