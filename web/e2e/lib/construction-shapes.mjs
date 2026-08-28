// Visible-construction-shape classifier, extracted verbatim from
// heldout-cold-quality-audit.mjs (Phase 141) so the seam-blend saturation
// probe provably measures with the SAME classifier the primary gate uses.
// construction-shapes-fixture.mjs freezes the classification of a fixed item
// list; run it after any edit here. The only addition over the audit's
// original is the 'seamblend' branch — unreachable for every legacy input
// (production Auto never emits sourceMode 'seamblend'), so audit output is
// unchanged by construction.

export const DIRECT_SUFFIXES = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']
export const ROOT_METAPHOR_TAILS = [
  'flow', 'forge', 'spark', 'seed', 'craft', 'nest', 'lab', 'wave', 'link', 'pulse',
  'beam', 'grid', 'vault', 'relay', 'trace', 'scope', 'prism', 'lumen', 'nova', 'peak',
  'trail', 'path', 'signal', 'hive', 'smith', 'harbor', 'grove', 'spring', 'frame',
  'glow', 'flux', 'loom', 'muse', 'atlas',
]
export const ASSEMBLED_CONSTRUCTION_SHAPES = new Set([
  'direct_suffix', 'root_metaphor', 'multi_concept',
])
export const TEMPLATE_CONSTRUCTION_SHAPES = new Set(['direct_suffix', 'root_metaphor'])

export const letters = (value) => value.toLowerCase().replace(/[^a-z]/g, '')

export const isDirectSuffix = (item) => (
  item.sourceMode === 'brandable'
  && item.concept_coverage === 1
  && DIRECT_SUFFIXES.some((ending) => letters(item.name).endsWith(ending))
)

// This is a visible-shape diagnostic, not generator provenance. It measures
// how assembled a page reads without claiming which random branch emitted a
// candidate. Keep it observation-only until human preference data validates
// which construction shares actually predict a name someone would choose.
export const constructionShape = (item) => {
  if (item.sourceMode === 'respell') return 'respell'
  if (item.sourceMode === 'realword') return 'realword'
  if (item.sourceMode === 'compound') return 'compound'
  if (item.sourceMode === 'seamblend') return 'seamblend'
  if (item.construction === 'guided_metaphor') return 'root_metaphor'
  if (isDirectSuffix(item)) return 'direct_suffix'
  if (item.sourceMode === 'brandable' && (item.concept_coverage ?? 0) >= 2) {
    return 'multi_concept'
  }
  const normalized = letters(item.name)
  if (
    item.sourceMode === 'brandable'
    && (item.concept_coverage ?? 0) > 0
    && ROOT_METAPHOR_TAILS.some((ending) => (
      normalized.length >= ending.length + 2 && normalized.endsWith(ending)
    ))
  ) return 'root_metaphor'
  return 'other_brandable'
}
