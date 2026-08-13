import type { NameResult } from '../src/lib/engine.ts'
import {
  hasTasteItem,
  isLegacyShareStub,
  mergeSavedNames,
  migrateLegacyShareRows,
  removeSavedRows,
  savedNameEntries,
  tasteIdentity,
  toggleTasteRows,
  withoutSavedName,
  withoutTasteItem,
} from '../src/lib/taste-identity.ts'

function result(name: string, context?: string): NameResult {
  return {
    name,
    style: 'big_tech',
    tasteContext: context ? { id: context, description: context, roots: [] } : undefined,
    syllables: 2,
    score_pronounce: 85,
    score_novelty: 90,
    score_memorability: 80,
    connotations: [],
  }
}

function shareStub(name: string): NameResult {
  return {
    name,
    style: 'big_tech',
    syllables: 0,
    score_pronounce: 0,
    score_novelty: 0,
    score_memorability: 0,
    connotations: [],
  }
}

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(message)
  console.log(`PASS  ${message}`)
}

const projectA = result('Noma', 'project-a')
const projectB = result('Noma', 'project-b')
const projectC = result('Noma', 'project-c')
const legacy = result('Noma')

check(
  tasteIdentity(projectA) !== tasteIdentity(projectB)
    && tasteIdentity(projectA) !== tasteIdentity(legacy),
  'taste identity includes project context and keeps legacy separate',
)
check(
  tasteIdentity(legacy) === tasteIdentity(result(' NOMA ')),
  'case and surrounding whitespace normalize inside one taste context',
)
const composedCafe = result('Café', 'project-a')
const decomposedCafe = result(' Cafe\u0301 ', 'project-a')
check(
  tasteIdentity(composedCafe) === tasteIdentity(decomposedCafe),
  'canonically equivalent Unicode spellings share one scoped taste identity',
)

const favorites = [projectA, projectB]
const rejected = [projectB]
check(
  hasTasteItem(favorites, projectA)
    && hasTasteItem(favorites, projectB)
    && !hasTasteItem(favorites, projectC),
  'the same spelling can be liked independently across project contexts',
)
check(
  withoutTasteItem(favorites, projectA).length === 1
    && hasTasteItem(withoutTasteItem(favorites, projectA), projectB),
  'removing one project like leaves the other project like intact',
)
check(
  withoutTasteItem(rejected, projectA).length === 1
    && withoutTasteItem(rejected, projectB).length === 0,
  'same-context exclusion never erases an opposite label from another project',
)

const passWrites: string[] = []
const passedFromLike = toggleTasteRows(
  [projectA],
  [],
  projectA,
  'rejected',
  (items) => passWrites.push(`favorites:${items.map((item) => item.name).join(',')}`),
  (items) => passWrites.push(`rejected:${items.map((item) => item.name).join(',')}`),
)
check(
  passedFromLike.persisted
    && !passedFromLike.rollbackFailed
    && passedFromLike.favorites.length === 0
    && passedFromLike.rejected[0] === projectA
    && passWrites.join('|') === 'favorites:|rejected:Noma',
  'liked-to-passed switching removes the old label before writing the new one',
)

const likeWrites: string[] = []
const likedFromPass = toggleTasteRows(
  [],
  [projectA],
  projectA,
  'favorite',
  (items) => likeWrites.push(`favorites:${items.map((item) => item.name).join(',')}`),
  (items) => likeWrites.push(`rejected:${items.map((item) => item.name).join(',')}`),
)
check(
  likedFromPass.persisted
    && likedFromPass.favorites[0] === projectA
    && likedFromPass.rejected.length === 0
    && likeWrites.join('|') === 'rejected:|favorites:Noma',
  'passed-to-liked switching uses the symmetric old-label-first order',
)

let targetWriteAfterSourceFailure = false
const sourceWriteFailure = toggleTasteRows(
  [projectA],
  [],
  projectA,
  'rejected',
  () => { throw new Error('favorites unavailable') },
  () => { targetWriteAfterSourceFailure = true },
)
check(
  !sourceWriteFailure.persisted
    && !sourceWriteFailure.rollbackFailed
    && sourceWriteFailure.favorites[0] === projectA
    && sourceWriteFailure.rejected.length === 0
    && !targetWriteAfterSourceFailure,
  'a failed old-label removal never attempts the new-label write',
)

const restoredWrites: string[] = []
const restoredAfterTargetFailure = toggleTasteRows(
  [projectA],
  [],
  projectA,
  'rejected',
  (items) => restoredWrites.push(`favorites:${items.map((item) => item.name).join(',')}`),
  () => {
    restoredWrites.push('rejected:FAIL')
    throw new Error('rejected unavailable')
  },
)
check(
  !restoredAfterTargetFailure.persisted
    && !restoredAfterTargetFailure.rollbackFailed
    && restoredAfterTargetFailure.favorites[0] === projectA
    && restoredAfterTargetFailure.rejected.length === 0
    && restoredWrites.join('|') === 'favorites:|rejected:FAIL|favorites:Noma',
  'a failed new-label write restores the previous liked state',
)

let favoriteWrites = 0
const neutralAfterFavoriteRollbackFailure = toggleTasteRows(
  [projectA],
  [],
  projectA,
  'rejected',
  () => {
    favoriteWrites++
    if (favoriteWrites === 2) throw new Error('rollback unavailable')
  },
  () => { throw new Error('rejected unavailable') },
)
check(
  !neutralAfterFavoriteRollbackFailure.persisted
    && neutralAfterFavoriteRollbackFailure.rollbackFailed
    && neutralAfterFavoriteRollbackFailure.favorites.length === 0
    && neutralAfterFavoriteRollbackFailure.rejected.length === 0,
  'failed liked-to-passed rollback reports the honest neutral durable state',
)

let rejectedWrites = 0
const neutralAfterRejectedRollbackFailure = toggleTasteRows(
  [],
  [projectA],
  projectA,
  'favorite',
  () => { throw new Error('favorites unavailable') },
  () => {
    rejectedWrites++
    if (rejectedWrites === 2) throw new Error('rollback unavailable')
  },
)
check(
  !neutralAfterRejectedRollbackFailure.persisted
    && neutralAfterRejectedRollbackFailure.rollbackFailed
    && neutralAfterRejectedRollbackFailure.favorites.length === 0
    && neutralAfterRejectedRollbackFailure.rejected.length === 0,
  'failed passed-to-liked rollback reports the symmetric neutral durable state',
)

const oneKeyFailure = toggleTasteRows(
  [],
  [],
  projectA,
  'favorite',
  () => { throw new Error('favorites unavailable') },
  () => { throw new Error('must not run') },
)
check(
  !oneKeyFailure.persisted
    && !oneKeyFailure.rollbackFailed
    && oneKeyFailure.favorites.length === 0
    && oneKeyFailure.rejected.length === 0,
  'a single-key write failure keeps the previous neutral state',
)

let cappedRejected: NameResult[] = []
const capResult = toggleTasteRows(
  [],
  [projectA, projectB],
  projectC,
  'rejected',
  () => { throw new Error('must not run') },
  (items) => { cappedRejected = items },
  2,
)
check(
  capResult.persisted
    && cappedRejected.length === 2
    && cappedRejected[0] === projectB
    && cappedRejected[1] === projectC,
  'a successful pass still enforces the bounded rejected-history cap',
)

const repairedConflict = toggleTasteRows(
  [projectA],
  [projectA],
  projectA,
  'favorite',
  () => {},
  () => { throw new Error('must not run') },
)
check(
  repairedConflict.persisted
    && repairedConflict.favorites.length === 0
    && repairedConflict.rejected[0] === projectA,
  'toggling either side of a historical conflict removes only that selected label',
)

const reviewedPasses = [projectA, projectB, legacy]
const afterProjectAUndo = withoutTasteItem(reviewedPasses, result(' NOMA ', 'project-a'))
check(
  afterProjectAUndo.length === 2
    && afterProjectAUndo[0] === projectB
    && afterProjectAUndo[1] === legacy,
  'undoing one scoped pass preserves same-spelling passes in another project and legacy',
)
check(
  withoutTasteItem(reviewedPasses, projectC).length === reviewedPasses.length,
  'undoing an unknown pass is a no-op',
)

const importedNoma = shareStub('NOMA')
const importedLexix = shareStub('Lexix')
const saved = mergeSavedNames(favorites, [importedNoma, importedLexix])
check(
  saved.length === 2
    && saved[0] === projectA
    && saved[1] === importedLexix,
  'Saved dedupes by spelling and prefers the first explicit scored record',
)
const canonicalSaved = mergeSavedNames([composedCafe], [shareStub('Cafe\u0301')])
check(
  canonicalSaved.length === 1
    && canonicalSaved[0] === composedCafe
    && withoutSavedName([composedCafe, shareStub('Cafe\u0301')], composedCafe).length === 0,
  'Saved dedupe and spelling-wide removal treat NFC and NFD forms as one name',
)
const entries = savedNameEntries(favorites, [importedNoma, importedLexix])
check(
  entries.length === 2
    && entries[0].explicitLikes === 2
    && entries[0].scopedProjects === 2
    && !entries[0].legacyLiked
    && entries[0].imported
    && entries[1].explicitLikes === 0
    && entries[1].imported,
  'Saved retains source counts while presenting one card per spelling',
)
check(
  withoutSavedName([...favorites, importedNoma], projectA).length === 0,
  'removing a Saved spelling clears every positive and imported occurrence',
)
check(
  isLegacyShareStub(importedNoma)
    && !isLegacyShareStub(legacy)
    && !isLegacyShareStub({ ...importedNoma, tasteContext: projectA.tasteContext })
    && !isLegacyShareStub({ ...importedNoma, sourceMode: 'brandable' })
    && !isLegacyShareStub(shareStub('Broken\uD83D')),
  'only the exact historical unscoped share shape is migration-eligible',
)

const migrationWrites: string[] = []
const migrated = migrateLegacyShareRows(
  [importedNoma, legacy],
  [shareStub('Existing')],
  (items) => migrationWrites.push(`imported:${items.map((item) => item.name).join(',')}`),
  (items) => migrationWrites.push(`favorites:${items.map((item) => item.name).join(',')}`),
)
check(
  migrated.favorites.length === 1
    && migrated.favorites[0] === legacy
    && migrated.recoveredImported.length === 0
    && migrationWrites.join('|') === 'imported:Existing,NOMA|favorites:Noma',
  'legacy share migration writes imported-first and keeps a genuine unscoped like',
)

let touchedFavorites = false
const importFailure = migrateLegacyShareRows(
  [importedNoma, legacy],
  [],
  () => { throw new Error('quota') },
  () => { touchedFavorites = true },
)
check(
  importFailure.favorites.length === 1
    && importFailure.favorites[0] === legacy
    && importFailure.recoveredImported.length === 1
    && importFailure.recoveredImported[0] === importedNoma
    && !touchedFavorites,
  'an imported-key write failure recovers the share stub without treating it as taste',
)

let importedAfterPartial: NameResult[] = []
const partial = migrateLegacyShareRows(
  [importedNoma, legacy],
  [],
  (items) => { importedAfterPartial = items },
  () => { throw new Error('quota') },
)
const retryWrites: NameResult[][] = []
const retried = migrateLegacyShareRows(
  [importedNoma, legacy],
  importedAfterPartial,
  (items) => retryWrites.push(items),
  () => {},
)
check(
  partial.favorites.length === 1
    && partial.recoveredImported.length === 0
    && retried.favorites.length === 1
    && retried.recoveredImported.length === 0
    && retryWrites.length === 1
    && retryWrites[0].length === 1,
  'a favorites-key write failure remains idempotent across the next migration retry',
)

let unnecessaryWrites = 0
migrateLegacyShareRows([legacy], importedAfterPartial, () => { unnecessaryWrites++ }, () => { unnecessaryWrites++ })
check(unnecessaryWrites === 0, 'an already-clean favorites collection performs no migration writes')

const removalWrites: string[] = []
const removed = removeSavedRows(
  [projectA, projectB],
  [importedNoma, importedLexix],
  projectA,
  (items) => removalWrites.push(`imported:${items.map((item) => item.name).join(',')}`),
  (items) => removalWrites.push(`favorites:${items.map((item) => item.name).join(',')}`),
)
check(
  removed.removed
    && removed.favorites.length === 0
    && removed.importedSaved.length === 1
    && removalWrites.join('|') === 'imported:Lexix|favorites:',
  'Saved removal persists imported-first and removes every positive copy by spelling',
)

let importedOnlyFavoriteWrites = 0
const importedOnlyRemoval = removeSavedRows(
  [],
  [importedNoma],
  importedNoma,
  () => {},
  () => { importedOnlyFavoriteWrites++ },
)
check(
  importedOnlyRemoval.removed
    && importedOnlyRemoval.favorites.length === 0
    && importedOnlyRemoval.importedSaved.length === 0
    && importedOnlyFavoriteWrites === 0,
  'an imported-only removal performs no redundant favorites write',
)

let favoriteOnlyImportedWrites = 0
const favoriteOnlyRemoval = removeSavedRows(
  [projectA],
  [],
  projectA,
  () => { favoriteOnlyImportedWrites++ },
  () => {},
)
check(
  favoriteOnlyRemoval.removed
    && favoriteOnlyRemoval.favorites.length === 0
    && favoriteOnlyRemoval.importedSaved.length === 0
    && favoriteOnlyImportedWrites === 0,
  'an explicit-only removal performs no redundant imported write',
)

let favoritesWriteAfterImportFailure = false
const failedImportRemoval = removeSavedRows(
  [projectA],
  [importedNoma],
  projectA,
  () => { throw new Error('quota') },
  () => { favoritesWriteAfterImportFailure = true },
)
check(
  !failedImportRemoval.removed
    && failedImportRemoval.favorites.length === 1
    && failedImportRemoval.importedSaved.length === 1
    && !favoritesWriteAfterImportFailure,
  'a failed imported deletion leaves both Saved sources unchanged',
)

const rollbackWrites: string[] = []
const failedFavoriteRemoval = removeSavedRows(
  [projectA],
  [importedNoma],
  projectA,
  (items) => rollbackWrites.push(items.map((item) => item.name).join(',')),
  () => { throw new Error('quota') },
)
check(
  !failedFavoriteRemoval.removed
    && failedFavoriteRemoval.favorites.length === 1
    && failedFavoriteRemoval.importedSaved.length === 1
    && rollbackWrites.join('|') === '|NOMA',
  'a failed favorites deletion rolls the imported collection back before reporting failure',
)

let durableImportedAfterRollbackFailure = [importedNoma]
let importedWriteCount = 0
const failedRollbackRemoval = removeSavedRows(
  [projectA],
  [importedNoma],
  projectA,
  (items) => {
    importedWriteCount++
    if (importedWriteCount === 2) throw new Error('rollback quota')
    durableImportedAfterRollbackFailure = items
  },
  () => { throw new Error('favorites quota') },
)
check(
  !failedRollbackRemoval.removed
    && failedRollbackRemoval.favorites.length === 1
    && failedRollbackRemoval.importedSaved.length === 0
    && durableImportedAfterRollbackFailure.length === 0,
  'a failed compensating rollback reports the durable partial provenance state',
)

console.log('storage identity check: all checks passed')
