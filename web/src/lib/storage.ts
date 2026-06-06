import type { NameResult } from './engine'

const KEY = 'neologism:favorites'

export function loadFavorites(): NameResult[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as NameResult[]) : []
  } catch {
    return []
  }
}

export function saveFavorites(favorites: NameResult[]): void {
  localStorage.setItem(KEY, JSON.stringify(favorites))
}

export function toggleFavorite(favorites: NameResult[], item: NameResult): NameResult[] {
  const exists = favorites.some((f) => f.name === item.name)
  const next = exists ? favorites.filter((f) => f.name !== item.name) : [...favorites, item]
  saveFavorites(next)
  return next
}
