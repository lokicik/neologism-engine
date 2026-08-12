import type { NameResult, Style } from './engine'

const SHARE_STYLES = new Set<Style>(['big_tech', 'sci_fi', 'fantasy'])
export const MAX_SHARE_NAMES = 200
export const MAX_SHARE_HASH_LENGTH = 32_768
const MAX_SHARE_NAME_LENGTH = 80

export function exportText(favs: NameResult[]): void {
  const text = favs.map((f) => f.name).join('\n')
  download('names.txt', text, 'text/plain')
}

export function exportJson(favs: NameResult[]): void {
  const data = favs.map((f) => ({ name: f.name, style: f.style }))
  download('names.json', JSON.stringify(data, null, 2), 'application/json')
}

export function encodeShareUrl(favs: NameResult[]): string {
  if (favs.length > MAX_SHARE_NAMES) {
    throw new Error(`A share link can include at most ${MAX_SHARE_NAMES} names.`)
  }
  const pairs = favs.map((f) => ({ n: f.name, s: f.style }))
  const encoded = btoa(JSON.stringify(pairs))
  const hash = `#names=${encoded}`
  if (hash.length > MAX_SHARE_HASH_LENGTH) {
    throw new Error('This shortlist is too large to fit safely in a share link.')
  }
  return `${location.origin}${location.pathname}${hash}`
}

export function decodeShareUrl(): Array<{ name: string; style: Style }> {
  try {
    const hash = location.hash
    if (!hash.startsWith('#names=')) return []
    if (hash.length > MAX_SHARE_HASH_LENGTH) return []
    const encoded = hash.slice('#names='.length)
    const parsed = JSON.parse(atob(encoded)) as unknown
    if (!Array.isArray(parsed)) return []
    if (parsed.length > MAX_SHARE_NAMES) return []
    return parsed
      .filter((item): item is { n: string; s: Style } => (
        typeof item === 'object'
        && item !== null
        && typeof (item as { n?: unknown }).n === 'string'
        && typeof (item as { s?: unknown }).s === 'string'
        && (item as { n: string }).n.trim().length > 0
        && (item as { n: string }).n.trim().length <= MAX_SHARE_NAME_LENGTH
        && !/[\u0000-\u001f\u007f]/.test((item as { n: string }).n)
        && SHARE_STYLES.has((item as { s: Style }).s)
      ))
      .map((item) => ({ name: item.n.trim(), style: item.s }))
  } catch {
    return []
  }
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  try {
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
