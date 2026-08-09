import type { Config, TasteContext } from './engine'

export function tasteContextForConfig(cfg: Config): TasteContext {
  const description = cfg.description?.trim() || undefined
  const roots = [...new Set(
    (cfg.roots ?? [])
      .map((root) => root.trim().toLowerCase())
      .filter(Boolean),
  )].sort()
  // Context deliberately ignores count, randomness, constraints, and source
  // mode: names for the same project remain comparable across those controls.
  const normalizedDescription = description?.toLowerCase().replace(/\s+/g, ' ') ?? ''
  const id = JSON.stringify([cfg.style, normalizedDescription, roots])
  return { id, description, roots }
}
