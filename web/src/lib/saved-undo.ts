import type { NameResult } from './engine'
import { normalizedName, tasteIdentity } from './taste-identity'

interface RemovedRow { item: NameResult; index: number }
export interface SavedRemoval {
  name: string
  favorites: RemovedRow[]
  imported: RemovedRow[]
  passes: string[]
}

export function captureSavedRemoval(item: NameResult, favorites: NameResult[], imported: NameResult[], rejected: NameResult[]): SavedRemoval {
  const key = normalizedName(item)
  const rows = (items: NameResult[]) => items.flatMap((value, index) => normalizedName(value) === key ? [{ item: value, index }] : [])
  return { name: item.name, favorites: rows(favorites), imported: rows(imported), passes: rejected.filter(value => normalizedName(value) === key).map(tasteIdentity).sort() }
}

// Reinsert only the removed sources into today's collections, never a snapshot
// of the whole collection. A later choice for this spelling takes precedence.
export function restoreSavedRemoval(receipt: SavedRemoval, favorites: NameResult[], imported: NameResult[], rejected: NameResult[]) {
  const key = receipt.name.trim().toLowerCase().normalize('NFC')
  const passes = rejected.filter(item => normalizedName(item) === key).map(tasteIdentity).sort()
  if ([...favorites, ...imported].some(item => normalizedName(item) === key) || JSON.stringify(passes) !== JSON.stringify(receipt.passes)) return null
  const insert = (current: NameResult[], rows: RemovedRow[]) => {
    const next = [...current]
    for (const { item, index } of rows) next.splice(Math.min(index, next.length), 0, item)
    return next
  }
  return { favorites: insert(favorites, receipt.favorites), imported: insert(imported, receipt.imported) }
}
