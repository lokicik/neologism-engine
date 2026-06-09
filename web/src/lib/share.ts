import type { NameResult } from './engine'

export function exportText(favs: NameResult[]): void {
  const text = favs.map((f) => f.name).join('\n')
  download('names.txt', text, 'text/plain')
}

export function exportJson(favs: NameResult[]): void {
  const data = favs.map((f) => ({ name: f.name, style: f.style }))
  download('names.json', JSON.stringify(data, null, 2), 'application/json')
}

export function encodeShareUrl(favs: NameResult[]): string {
  const pairs = favs.map((f) => ({ n: f.name, s: f.style }))
  const encoded = btoa(JSON.stringify(pairs))
  return `${location.origin}${location.pathname}#names=${encoded}`
}

export function decodeShareUrl(): Array<{ name: string; style: string }> {
  try {
    const hash = location.hash
    if (!hash.startsWith('#names=')) return []
    const encoded = hash.slice('#names='.length)
    const pairs = JSON.parse(atob(encoded)) as Array<{ n: string; s: string }>
    return pairs.map((p) => ({ name: p.n, style: p.s }))
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
  a.click()
  URL.revokeObjectURL(url)
}
