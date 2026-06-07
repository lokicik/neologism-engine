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

// Recently-shown names, persisted so repeats don't return across reloads.
const RECENT_KEY = 'neologism:recent'

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveRecent(names: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(names))
  } catch {
    // ignore quota / serialization errors
  }
}
