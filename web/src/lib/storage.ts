import type { NameResult } from './engine'
import { defaultJudgeConfig, type JudgeConfig } from './judge'
import {
  hasTasteItem,
  isLegacyShareStub,
  mergeSavedNames,
  migrateLegacyShareRows,
  removeSavedRows,
  sameSavedName,
  toggleTasteRows,
  withoutSavedName,
  withoutTasteItem,
  type TasteLabel,
  type TasteToggleResult,
} from './taste-identity'
import { isWellFormedUnicode } from './unicode.ts'

export { mergeSavedNames } from './taste-identity'

const KEY = 'neologism:favorites'
const REJECTED_KEY = 'neologism:rejected'
const IMPORTED_SAVED_KEY = 'neologism:imported-saved'
const TASTE_REFERENCES_KEY = 'neologism:taste-references'
const MAX_REJECTED = 200
const MAX_TASTE_REFERENCE_INPUT = 240
let recoveredImportedSaved: NameResult[] = []

function isStoredNameResult(value: unknown): value is NameResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const context = row.tasteContext
  const validContext = context === undefined
    || context === null
    || (
      typeof context === 'object'
      && !Array.isArray(context)
      && typeof (context as Record<string, unknown>).id === 'string'
      && (context as Record<string, unknown>).id !== ''
      && Array.isArray((context as Record<string, unknown>).roots)
      && ((context as Record<string, unknown>).roots as unknown[])
        .every((root) => typeof root === 'string')
      && (
        (context as Record<string, unknown>).description === undefined
        || typeof (context as Record<string, unknown>).description === 'string'
      )
    )
  return typeof row.name === 'string'
    && row.name.trim().length > 0
    && row.name.trim().length <= 80
    && !/[\u0000-\u001f\u007f]/.test(row.name)
    && isWellFormedUnicode(row.name)
    && (row.style === 'big_tech' || row.style === 'sci_fi' || row.style === 'fantasy')
    && typeof row.syllables === 'number'
    && Number.isFinite(row.syllables)
    && row.syllables >= 0
    && typeof row.score_pronounce === 'number'
    && Number.isFinite(row.score_pronounce)
    && typeof row.score_novelty === 'number'
    && Number.isFinite(row.score_novelty)
    && typeof row.score_memorability === 'number'
    && Number.isFinite(row.score_memorability)
    && Array.isArray(row.connotations)
    && row.connotations.every((connotation) => typeof connotation === 'string')
    && validContext
}

export function loadFavorites(): NameResult[] {
  recoveredImportedSaved = []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const stored = JSON.parse(raw) as unknown
    if (!Array.isArray(stored)) return []
    const valid = stored.filter(isStoredNameResult)

    const migration = migrateLegacyShareRows(
      valid,
      loadImportedSaved(),
      writeImportedSaved,
      writeFavorites,
    )
    recoveredImportedSaved = migration.recoveredImported
    return migration.favorites
  } catch {
    return []
  }
}

function writeFavorites(favorites: NameResult[]): void {
  localStorage.setItem(KEY, JSON.stringify(favorites))
}

export function saveFavorites(favorites: NameResult[]): void {
  // If the imported key was temporarily unwritable during old-share
  // migration, the old favorites key is still the only durable copy of those
  // Saved names. Preserve the stubs through later taste mutations until a
  // dedicated imported write succeeds or the user explicitly removes them.
  writeFavorites([...favorites, ...recoveredImportedSaved])
}

export function toggleFavorite(favorites: NameResult[], item: NameResult): NameResult[] {
  const exists = hasTasteItem(favorites, item)
  const next = exists
    ? withoutTasteItem(favorites, item)
    : [...favorites, item]
  saveFavorites(next)
  return next
}

export function removeFavorite(favorites: NameResult[], item: NameResult): NameResult[] {
  const next = withoutTasteItem(favorites, item)
  if (next.length !== favorites.length) saveFavorites(next)
  return next
}

// Explicit negative taste signals. Keeping the latest 200 is enough to learn
// recurring shapes without letting a years-old pass history dominate forever.
export function loadRejected(): NameResult[] {
  try {
    const raw = localStorage.getItem(REJECTED_KEY)
    if (!raw) return []
    const stored = JSON.parse(raw) as unknown
    return Array.isArray(stored) ? stored.filter(isStoredNameResult) : []
  } catch {
    return []
  }
}

export function saveRejected(rejected: NameResult[]): void {
  localStorage.setItem(REJECTED_KEY, JSON.stringify(rejected.slice(-MAX_REJECTED)))
}

export function toggleRejected(rejected: NameResult[], item: NameResult): NameResult[] {
  const exists = hasTasteItem(rejected, item)
  const next = exists
    ? withoutTasteItem(rejected, item)
    : [...rejected, item].slice(-MAX_REJECTED)
  saveRejected(next)
  return next
}

export function removeRejected(rejected: NameResult[], item: NameResult): NameResult[] {
  const next = withoutTasteItem(rejected, item)
  if (next.length !== rejected.length) saveRejected(next)
  return next
}

export function toggleTasteFeedback(
  favorites: NameResult[],
  rejected: NameResult[],
  item: NameResult,
  label: TasteLabel,
): TasteToggleResult {
  return toggleTasteRows(
    favorites,
    rejected,
    item,
    label,
    saveFavorites,
    saveRejected,
    MAX_REJECTED,
  )
}

// Names opened from somebody else's share link belong in Saved, but are not an
// explicit positive taste action by the recipient. Keep them in a separate
// collection so they never train the local profile or enter a taste export.
export function loadImportedSaved(): NameResult[] {
  try {
    const raw = localStorage.getItem(IMPORTED_SAVED_KEY)
    if (!raw) return recoveredImportedSaved
    const stored = JSON.parse(raw) as unknown
    if (!Array.isArray(stored)) return recoveredImportedSaved
    return mergeSavedNames(stored.filter(isLegacyShareStub), recoveredImportedSaved)
  } catch {
    return recoveredImportedSaved
  }
}

function writeImportedSaved(items: NameResult[]): void {
  localStorage.setItem(IMPORTED_SAVED_KEY, JSON.stringify(items))
}

export function saveImportedSaved(items: NameResult[]): boolean {
  try {
    writeImportedSaved(items)
    return true
  } catch {
    // ignore quota / privacy-mode storage errors
    return false
  }
}

export function addImportedSaved(
  current: NameResult[],
  items: NameResult[],
): { items: NameResult[]; persisted: boolean } {
  const next = mergeSavedNames(current, items)
  const persisted = saveImportedSaved(next)
  if (persisted) recoveredImportedSaved = []
  return { items: next, persisted }
}

export function removeSavedEverywhere(
  favorites: NameResult[],
  importedSaved: NameResult[],
  item: NameResult,
): ReturnType<typeof removeSavedRows> {
  // A previous migration may already have persisted the imported copy but
  // failed to clean the exact old stub from the favorites key. Include that
  // pending durable row in this transaction so an imported-only optimization
  // cannot leave it behind to reappear on reload.
  let pendingLegacyRows: NameResult[] = []
  try {
    const raw = localStorage.getItem(KEY)
    const stored = raw ? JSON.parse(raw) as unknown : []
    if (Array.isArray(stored)) {
      pendingLegacyRows = stored.filter((candidate): candidate is NameResult => (
        isLegacyShareStub(candidate) && sameSavedName(candidate, item)
      ))
    }
  } catch {
    // The normal removal path still handles the in-memory sources.
  }

  const removal = removeSavedRows(
    [...favorites, ...pendingLegacyRows],
    importedSaved,
    item,
    writeImportedSaved,
    writeFavorites,
  )
  if (!removal.removed && pendingLegacyRows.length > 0) {
    // The old key still owns a recoverable copy. Keep presenting it as
    // imported-only, never as explicit taste, until cleanup can succeed.
    return { favorites, importedSaved, removed: false }
  }
  if (!removal.importedSaved.some((candidate) => (
    sameSavedName(candidate, item)
  ))) {
    recoveredImportedSaved = withoutSavedName(recoveredImportedSaved, item)
  }
  return {
    ...removal,
    favorites: removal.favorites.filter((candidate) => !isLegacyShareStub(candidate)),
  }
}

// Optional examples such as "Vercel, Linear, Notion" seed the local shape
// ranker. They are deliberately stored separately from explicit likes/passes.
export function loadTasteReferences(): string {
  try {
    return localStorage.getItem(TASTE_REFERENCES_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveTasteReferences(value: string): boolean {
  try {
    localStorage.setItem(TASTE_REFERENCES_KEY, value.slice(0, MAX_TASTE_REFERENCE_INPUT))
    return true
  } catch {
    return false
  }
}

// Recently-shown names, persisted so repeats don't return across reloads.
const RECENT_KEY = 'neologism:recent'
// A name cannot recur within this many explored names. Since Phase 35 the core
// applies exact exclusion to the full list while windowing only fuzzy/stem work.
export const RECENT_WINDOW = 20000

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) && parsed.every((name) => typeof name === 'string')
      ? parsed.slice(-RECENT_WINDOW)
      : []
  } catch {
    return []
  }
}

export function saveRecent(names: string[]): boolean {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(names.slice(-RECENT_WINDOW)))
    return true
  } catch {
    return false
  }
}

// Whether the visitor has entered the app before — first visit shows the
// landing page, later visits go straight to the generator (Phase 38).
const VISITED_KEY = 'neologism:visited'

export function hasVisited(): boolean {
  try {
    return localStorage.getItem(VISITED_KEY) === '1'
  } catch {
    return false
  }
}

export function markVisited(): boolean {
  try {
    localStorage.setItem(VISITED_KEY, '1')
    return true
  } catch {
    // ignore — landing will just show again next time
    return false
  }
}

// Optional "Sharpen with AI" judge config (Phase 50). Persisted so the owner
// configures it once. The API key lives in localStorage too — a deliberate
// trade-off for a personal tool (the SettingsModal warns the user); it is only
// ever sent directly from the browser to the provider the user chose.
const JUDGE_KEY = 'neologism:judge'

function judgeConfigFromUnknown(value: unknown): JudgeConfig | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(record, key)
  const strings = ['apiKey', 'model', 'endpoint', 'prompt'] as const
  const prices = ['priceIn', 'priceOut'] as const

  if (has('enabled') && typeof record.enabled !== 'boolean') return null
  if (has('provider') && record.provider !== 'openrouter' && record.provider !== 'localhost') return null
  if (strings.some((key) => has(key) && typeof record[key] !== 'string')) return null
  if (prices.some((key) => (
    has(key)
      && (typeof record[key] !== 'number' || !Number.isFinite(record[key]) || record[key] < 0)
  ))) return null

  const config = defaultJudgeConfig()
  if (typeof record.enabled === 'boolean') config.enabled = record.enabled
  if (record.provider === 'openrouter' || record.provider === 'localhost') config.provider = record.provider
  for (const key of strings) {
    if (typeof record[key] === 'string') config[key] = record[key]
  }
  for (const key of prices) {
    if (typeof record[key] === 'number') config[key] = record[key]
  }
  return config
}

export function loadJudgeConfig(): JudgeConfig {
  try {
    const raw = localStorage.getItem(JUDGE_KEY)
    if (!raw) return defaultJudgeConfig()
    return judgeConfigFromUnknown(JSON.parse(raw)) ?? defaultJudgeConfig()
  } catch {
    return defaultJudgeConfig()
  }
}

export function saveJudgeConfig(cfg: JudgeConfig): boolean {
  try {
    localStorage.setItem(JUDGE_KEY, JSON.stringify(cfg))
    return true
  } catch {
    return false
  }
}
