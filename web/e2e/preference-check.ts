// Deterministic smoke test for the local favorite-profile ranker.
// Bundle with esbuild, then run with Node (see Phase 59 verification notes).
import {
  buildProfile,
  buildReferencedProfile,
  coldQualityPoolCount,
  compoundTastePoolCount,
  feedbackForContext,
  needsQualityRepair,
  parseTasteReferences,
  preferencePoolCount,
  prioritizeColdStrongLead,
  rankByPreference,
  repairWeakShortlist,
  shortlistByPreference,
} from '../src/lib/preferences'
import type { NameResult, NamingMode } from '../src/lib/engine'

function result(
  name: string,
  syllables = 2,
  sourceMode?: NamingMode,
  contextId?: string,
): NameResult {
  return {
    name,
    style: 'big_tech',
    sourceMode,
    syllables,
    score_pronounce: 85,
    score_novelty: 90,
    score_memorability: 80,
    connotations: [],
    tasteContext: contextId ? { id: contextId } : undefined,
  }
}

function scoredResult(name: string, score: number): NameResult {
  return {
    ...result(name),
    score_pronounce: score,
    score_novelty: score,
    score_memorability: score,
  }
}

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(message)
  console.log(`PASS  ${message}`)
}

const ixProfile = buildProfile([result('Nomix'), result('Lexix'), result('Markix')])
check(ixProfile !== null, 'three favorites build a profile')
if (ixProfile) {
  const ranked = rankByPreference(
    [result('KeyBazaar', 3), result('Nomora', 3), result('Nymix')],
    ixProfile,
  )
  check(ranked[0].name === 'Nymix', 'repeated -ix taste outranks an unrelated shape')

  check(preferencePoolCount(10, ixProfile) === 60, 'active taste opens a six-page candidate pool')
  const shortlist = shortlistByPreference(
    [
      result('Velora'),
      result('Melora'),
      result('Telora'),
      result('Pelora'),
      result('Delora'),
      result('Selora'),
      result('Relora'),
      result('Belora'),
      result('Kelora'),
      result('Helora'),
      result('Nymix'),
    ],
    ixProfile,
    10,
  )
  check(
    shortlist.length === 10 && shortlist[0].name === 'Nymix',
    'taste can pull a better candidate from outside the original first page',
  )

  const exploratoryPool = [
    'Lexix', 'Nexix', 'Vexix', 'Dexix', 'Rexix', 'Texix',
    'Mexix', 'Pexix', 'Kexix', 'Zexix', 'Bexix', 'Cexix',
  ].map((name) => scoredResult(name, 88))
  const seededA = shortlistByPreference(exploratoryPool, ixProfile, 10, 7)
    .map((item) => item.name).join('|')
  const seededARepeat = shortlistByPreference(exploratoryPool, ixProfile, 10, 7)
    .map((item) => item.name).join('|')
  const seededB = shortlistByPreference(exploratoryPool, ixProfile, 10, 42)
    .map((item) => item.name).join('|')
  check(seededA === seededARepeat, 'one taste-session salt stays deterministic')
  check(seededA !== seededB, 'a fresh taste-session salt explores a nearby shortlist')

  const directSuffixPool = [
    'Lexia', 'Nymio', 'Nomora', 'Markix', 'Mintify',
    'Lexel', 'Nymen', 'Nomon', 'Tagion', 'Keyera',
    'Scopeflow', 'Tagforge', 'Keyscope',
  ].map((name) => ({
    ...scoredResult(name, 88),
    sourceMode: 'brandable' as const,
    concept_coverage: 1,
  }))
  const familyBalanced = shortlistByPreference(directSuffixPool, ixProfile, 10, 7)
  const directEndings = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']
  check(
    familyBalanced.length === 10
      && familyBalanced.filter((item) => directEndings.some((ending) => (
        item.name.toLowerCase().endsWith(ending)
      ))).length <= 8,
    'a personalized page keeps space for non-suffix naming forms',
  )
}
check(preferencePoolCount(10, null) === 10, 'cold start keeps the requested candidate count')
check(coldQualityPoolCount(10) === 30, 'a weak cold Auto page opens a three-page repair pool')

const weakColdPage = [
  scoredResult('Lexion', 88),
  scoredResult('Marken', 88),
  scoredResult('Nomera', 88),
  scoredResult('Mintora', 68),
  scoredResult('Checkalias', 62),
  scoredResult('Developr', 86),
  scoredResult('Mintel', 88),
  scoredResult('Lexia', 88),
  scoredResult('Nomio', 88),
  scoredResult('Markel', 88),
]
check(needsQualityRepair(weakColdPage, 10), 'a sub-75 cold candidate activates repair')
const repairedColdPage = repairWeakShortlist(
  weakColdPage,
  [scoredResult('Mintalias', 82), scoredResult('Nymera', 88)],
  10,
)
check(
  repairedColdPage.length === 10
    && !repairedColdPage.some((item) => item.name === 'Mintora' || item.name === 'Checkalias')
    && repairedColdPage.slice(0, 3).map((item) => item.name).join('|') === 'Lexion|Marken|Nomera',
  'cold repair preserves strong order and replaces only weak slots',
)
check(
  !needsQualityRepair(repairedColdPage, 10),
  'a fully strong cold page avoids a second fallback generation',
)

const coldGuidedPage = [
  { ...scoredResult('Lexify', 82), sourceMode: 'brandable' as const, concept_coverage: 1 },
  {
    ...scoredResult('Keyloom', 90),
    sourceMode: 'brandable' as const,
    concept_coverage: 1,
    construction: 'guided_metaphor' as const,
    constructionRank: 1 as const,
  },
  { ...scoredResult('Keyscope', 88), sourceMode: 'brandable' as const, concept_coverage: 2 },
]
const guidedLead = prioritizeColdStrongLead(coldGuidedPage)
check(
  guidedLead[0].name === 'Keyloom'
    && guidedLead.map((item) => item.name).sort().join('|')
      === coldGuidedPage.map((item) => item.name).sort().join('|'),
  'cold first impression promotes a stronger equally relevant guided form without changing the set',
)
check(
  prioritizeColdStrongLead([
    { ...scoredResult('Keyscope', 82), concept_coverage: 2 },
    coldGuidedPage[1],
  ])[0].name === 'Keyscope',
  'cold first impression never trades away first-card concept coverage',
)
check(
  prioritizeColdStrongLead([
    { ...scoredResult('Lexify', 92), concept_coverage: 1 },
    coldGuidedPage[1],
  ])[0].name === 'Lexify',
  'cold first impression never trades away first-card structural quality',
)
check(
  prioritizeColdStrongLead([
    { ...scoredResult('Stashify', 82), sourceMode: 'brandable', concept_coverage: 1 },
    { ...scoredResult('Bufferlab', 85), sourceMode: 'brandable', concept_coverage: 1 },
  ])[0].name === 'Bufferlab',
  'a remaining suffix lead yields to a non-suffix form with a meaningful quality margin',
)
check(
  prioritizeColdStrongLead([
    { ...scoredResult('Draftify', 82), sourceMode: 'brandable', concept_coverage: 1 },
    { ...scoredResult('Inklink', 83), sourceMode: 'brandable', concept_coverage: 1 },
  ])[0].name === 'Draftify',
  'a marginal non-suffix score difference does not churn the cold lead',
)
check(
  prioritizeColdStrongLead([
    { ...scoredResult('Retroboard', 82), sourceMode: 'brandable', concept_coverage: 1 },
    { ...scoredResult('Keyshelf', 92), sourceMode: 'brandable', concept_coverage: 1 },
  ])[0].name === 'Retroboard',
  'an existing non-suffix lead is not reordered by the fallback rule',
)

const repetitiveColdPage = [
  { ...scoredResult('Vyntage', 88), sourceMode: 'respell' as const },
  ...['Lexia', 'Nexia', 'Vexia', 'Dexia', 'Rexia', 'Texia', 'Mexia', 'Pexia', 'Kexia']
    .map((name) => ({ ...scoredResult(name, 88), sourceMode: 'brandable' as const })),
]
check(
  needsQualityRepair(repetitiveColdPage, 10),
  'a strong but repetitive cold page activates the bounded diversity repair',
)
const diversityFallbackNames = ['Quartz', 'Mallow', 'Nimbus', 'Cedar', 'Vexel', 'Orbit', 'Fable', 'Prism', 'Tandem', 'Sentry']
const diversifiedColdPage = repairWeakShortlist(
  repetitiveColdPage,
  diversityFallbackNames
    .map((name) => ({ ...scoredResult(name, 88), sourceMode: 'brandable' as const })),
  10,
)
check(
  diversifiedColdPage[0].name === 'Vyntage',
  'cold diversity repair preserves the earned Respell accent',
)
check(
  diversifiedColdPage.some((item) => diversityFallbackNames.includes(item.name)),
  'cold diversity repair substitutes a same-quality Brandable alternative',
)
check(
  !needsQualityRepair(diversifiedColdPage, 10),
  'a diversified cold page does not need a second fallback generation',
)

const parsedReferences = parseTasteReferences(
  ' Vercel, linear; NOTION\nver-cel, x, A Really Long Reference Name Beyond Limit ',
)
check(
  parsedReferences.join('|') === 'Vercel|linear|NOTION',
  'reference names are trimmed, normalized, deduplicated, and length-checked',
)
check(
  parseTasteReferences('Alpha, Bravo, Cedar, Delta, Ember, Fable, Grove, Hazel, Ivory').length === 8,
  'reference input stays bounded at eight usable examples',
)

const referencedTaste = buildReferencedProfile([], [], 'Vercel, Linear, Notion')
check(
  referencedTaste.references.length === 3 && referencedTaste.profile !== null,
  'three reference names can initialize local taste before any feedback',
)
check(
  preferencePoolCount(10, referencedTaste.profile) === 60,
  'reference-initialized taste opens the larger local candidate pool',
)
if (referencedTaste.profile) {
  const ranked = rankByPreference(
    [scoredResult('Checktag', 62), scoredResult('Nomio', 88)],
    referencedTaste.profile,
  )
  check(
    ranked[0].name === 'Nomio',
    'reference affinity cannot promote a structurally weak name over a strong one',
  )

  const qualityShortlist = shortlistByPreference(
    [
      scoredResult('Checktag', 62),
      ...['Nomio', 'Lexia', 'Vercel', 'Tandem', 'Sentry', 'Prisma', 'Figma', 'Docker', 'Linear', 'Notion']
        .map((name) => scoredResult(name, 88)),
    ],
    referencedTaste.profile,
    10,
  )
  check(
    qualityShortlist.length === 10 && !qualityShortlist.some((item) => item.name === 'Checktag'),
    'a full strong pool keeps sub-75 structural names out of the visible page',
  )

  const conceptRanked = rankByPreference(
    [
      { ...scoredResult('Nymix', 88), concept_coverage: 1 },
      { ...scoredResult('Nymix', 88), concept_coverage: 2 },
    ],
    referencedTaste.profile,
  )
  check(
    conceptRanked[0].concept_coverage === 2,
    'taste ranking preserves a candidate that carries an additional brief concept',
  )
}

const deduplicatedTaste = buildReferencedProfile(
  [result('Vercel')],
  [],
  'ver-cel, Linear, Notion',
)
check(
  deduplicatedTaste.references.length === 2 && deduplicatedTaste.profile?.likedCount === 3,
  'a starred reference is counted only once in the positive profile',
)

const mintProfile = buildProfile([result('Mintix'), result('Mintio'), result('Mintia')])
if (mintProfile) {
  const familyShortlist = shortlistByPreference(
    [
      result('Mintora'), result('Mintify'), result('Mintix'), result('Mintio'),
      result('Nomora'), result('Lexora'), result('Vexora'), result('Sentry'),
      result('Prisma'), result('Docker'), result('Linear'), result('Notion'),
    ],
    mintProfile,
    10,
  )
  check(
    familyShortlist.length === 10
      && familyShortlist.filter((item) => item.name.startsWith('Mint')).length <= 2,
    'the visible personalized page restores the engine two-per-prefix limit',
  )
  check(
    shortlistByPreference([result('Mintix')], mintProfile, 0).length === 0,
    'a zero-size personalized request stays empty',
  )
  check(
    shortlistByPreference(
      [scoredResult('Mintix', 88), scoredResult('Mintio', 60)],
      mintProfile,
      2,
    ).length === 2,
    'a constrained pool relaxes quality and family preferences instead of starving',
  )
}

const namingEndingProfile = buildProfile([result('Lexion'), result('Nymion'), result('Nomion')])
if (namingEndingProfile) {
  const namingContext = {
    id: 'naming-project',
    description: 'a naming engine for developer projects',
    roots: [],
  }
  const namingShortlist = shortlistByPreference(
    [
      'Lexion', 'Nymion', 'Nomion', 'Markel', 'Mintel',
      'Lexen', 'Nymen', 'Nomix', 'Markix', 'Mintio', 'Marken', 'Tagora',
      'Velora', 'Sageia', 'Kiteify',
    ].map((name) => ({ ...scoredResult(name, 88), tasteContext: namingContext })),
    namingEndingProfile,
    10,
  )
  check(
    namingShortlist.filter((item) => item.name.endsWith('ion')).length <= 2,
    'a personalized naming page limits one exact ending family to two names',
  )
}

const generalEndingProfile = buildProfile([result('Lexia'), result('Nymia'), result('Nomia')])
if (generalEndingProfile) {
  const generalContext = {
    id: 'developer-project',
    description: 'a Rust CLI that processes logs',
    roots: [],
  }
  const generalShortlist = shortlistByPreference(
    [
      'Byteia', 'Crateia', 'Stackia', 'Kitia', 'Nodeia',
      'Pulseio', 'Traceio', 'Watchio', 'Scopeix', 'Beaconix', 'Rustify', 'Logify',
    ].map((name) => ({ ...scoredResult(name, 88), tasteContext: generalContext })),
    generalEndingProfile,
    10,
  )
  check(
    generalShortlist.filter((item) => item.name.endsWith('ia')).length <= 3,
    'a personalized non-naming page limits one exact ending family to three names',
  )
}

const projectALikes = [
  result('Nomix', 2, 'brandable', 'project-a'),
  result('Lexix', 2, 'brandable', 'project-a'),
  result('Markix', 2, 'brandable', 'project-a'),
]
const projectBLikes = [
  result('Nomora', 3, 'brandable', 'project-b'),
  result('Lexora', 3, 'brandable', 'project-b'),
  result('Markora', 3, 'brandable', 'project-b'),
]
const projectBPasses = [result('Nymix', 2, 'brandable', 'project-b')]
const projectAFeedback = feedbackForContext(
  [...projectALikes, ...projectBLikes],
  projectBPasses,
  'project-a',
)
check(
  projectAFeedback.favorites.length === 3 && projectAFeedback.rejected.length === 0,
  'live taste excludes feedback from other project contexts',
)
const projectAProfile = buildProfile(projectAFeedback.favorites, projectAFeedback.rejected)
if (projectAProfile) {
  const ranked = rankByPreference(
    [result('Vexora', 3), result('Nymix', 2)],
    projectAProfile,
  )
  check(ranked[0].name === 'Nymix', 'the current project keeps its own learned shape')
}
const unseenProject = feedbackForContext(projectALikes, [], 'project-c')
check(
  unseenProject.favorites.length === 0 && unseenProject.scope === 'project',
  'a new project does not inherit another project profile',
)
const legacyFeedback = feedbackForContext(
  [result('Noma'), result('Lexa'), result('Mara')],
  [],
  'project-a',
)
check(
  legacyFeedback.favorites.length === 3 && legacyFeedback.scope === 'legacy',
  'fully legacy feedback remains available as a compatibility fallback',
)

const compoundProfile = buildProfile([
  result('KeyBazaar', 3),
  result('RetroBoard', 3),
  result('TypeShelf', 2),
])
if (compoundProfile) {
  check(
    compoundTastePoolCount(10, compoundProfile) === 3,
    'strong two-part taste opens only a three-candidate Compound accent pool',
  )
  const ranked = rankByPreference(
    [result('Lexora', 3), result('KeyMarket', 3)],
    compoundProfile,
  )
  check(ranked[0].name === 'KeyMarket', 'compound-family taste stays in the compound family')
}

const broadLikes = [result('Noma'), result('Lexa'), result('Mara')]
const likedOnly = buildProfile(broadLikes)
check(likedOnly !== null, 'liked-only ranking remains available')
if (likedOnly) {
  check(
    compoundTastePoolCount(10, likedOnly) === 0,
    'single-part taste keeps guided Auto Brandable-first',
  )
  const ranked = rankByPreference([result('Vexium'), result('Vexora')], likedOnly)
  check(ranked[0].name === 'Vexora', 'positive profile alone prefers its familiar vowel ending')
}

const onePassContrast = buildProfile(broadLikes, [result('Nomora')])
check(onePassContrast?.avoided !== null, 'one pass stays a weak contrast once likes exist')

const contrastProfile = buildProfile(broadLikes, [
  result('Nomora'),
  result('Lexora'),
  result('Markora'),
  result('Velora'),
  result('Zenora'),
])
check(contrastProfile?.rejectedCount === 5, 'rejected feedback is represented in the local profile')
if (contrastProfile) {
  const ranked = rankByPreference([result('Vexora'), result('Vexium')], contrastProfile)
  check(ranked[0].name === 'Vexium', 'repeatedly rejected -ora shapes are pushed below alternatives')
}

const twoPasses = buildProfile([], [result('Nomora'), result('Lexora')])
check(twoPasses === null, 'two passes alone do not overfit the local ranker')

const passOnlyProfile = buildProfile([], [
  result('Nomora'),
  result('Lexora'),
  result('Markora'),
])
check(passOnlyProfile?.likedCount === 0, 'three passes build a profile without favorites')
if (passOnlyProfile) {
  const ranked = rankByPreference([result('Vexora'), result('Vexium')], passOnlyProfile)
  check(ranked[0].name === 'Vexium', 'pass-only learning steers away from a rejected shape')
}

const realwordProfile = buildProfile([
  result('Noma', 2, 'realword'),
  result('Lexa', 2, 'realword'),
  result('Mara', 2, 'realword'),
])
if (realwordProfile) {
  const ranked = rankByPreference([
    result('Vexa', 2, 'brandable'),
    result('Vexa', 2, 'realword'),
  ], realwordProfile)
  check(ranked[0].sourceMode === 'realword', 'liked naming modes break an otherwise tied shape')
}

const mixedModeProfile = buildProfile([
  result('Noma', 2, 'brandable'),
  result('Lexa', 2, 'brandable'),
  result('Mara', 2, 'realword'),
])
if (mixedModeProfile) {
  const ranked = rankByPreference([
    result('Vexa', 2, 'realword'),
    result('Vexa', 2, 'brandable'),
  ], mixedModeProfile)
  check(ranked[0].sourceMode === 'realword', 'a normal mixed-mode sample does not invent mode taste')
}

const rejectedRespellProfile = buildProfile([], [
  result('Noma', 2, 'respell'),
  result('Lexa', 2, 'respell'),
  result('Mara', 2, 'respell'),
])
if (rejectedRespellProfile) {
  const ranked = rankByPreference([
    result('Vexa', 2, 'respell'),
    result('Vexa', 2, 'brandable'),
  ], rejectedRespellProfile)
  check(ranked[0].sourceMode === 'brandable', 'passed naming modes lose an otherwise tied shape')
}
