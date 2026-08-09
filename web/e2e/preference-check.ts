// Deterministic smoke test for the local favorite-profile ranker.
// Bundle with esbuild, then run with Node (see Phase 59 verification notes).
import { buildProfile, feedbackForContext, rankByPreference } from '../src/lib/preferences'
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
