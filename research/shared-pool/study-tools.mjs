import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hash, protocol, dir } from './harness.mjs'

export function validateAnswers(study, answers, complete = true) {
  assert.equal(answers.schema, 'shared-pool-choices-v1')
  assert.equal(answers.studySha256, hash(JSON.stringify(study)))
  assert(Array.isArray(answers.answers))
  assert(answers.answers.length <= study.pages.length)
  const seen = new Set()
  for (const answer of answers.answers) {
    const page = study.pages.find((p) => p.id === answer.id)
    assert(page && !seen.has(answer.id), 'unknown or duplicate case')
    seen.add(answer.id)
    assert(['left', 'right', 'neither'].includes(answer.preference))
    for (const side of ['left', 'right']) {
      assert(Array.isArray(answer[side]), 'each side requires an explicit usable-name array (empty means none)')
      assert.equal(new Set(answer[side]).size, answer[side].length)
      assert(answer[side].every((name) => page[side].includes(name)), 'unknown name')
    }
  }
  if (complete) assert.equal(seen.size, study.pages.length, 'collection is incomplete')
}

export function scoreStudy(study, key, answers, studyProtocol = protocol) {
  validateAnswers(study, answers)
  assert.equal(key.studySha256, hash(JSON.stringify(study)))
  assert.equal(key.protocolSha256, hash(JSON.stringify(studyProtocol)))
  assert.equal(key.pages.length, study.pages.length)
  assert(key.pages.every((p) => ['left', 'right'].includes(p.experimentalSide)), 'invalid source mapping')
  assert.equal(new Set(key.pages.map((p) => p.id)).size, study.pages.length)
  assert(key.pages.every((p) => study.pages.some((s) => s.id === p.id)))
  const byId = new Map(answers.answers.map((a) => [a.id, a]))
  const normalized = (mapping) => {
    const answer = byId.get(mapping.id)
    const other = mapping.experimentalSide === 'left' ? 'right' : 'left'
    return { preference: answer.preference === 'neither' ? 'neither' : answer.preference === mapping.experimentalSide ? 'experiment' : 'baseline',
      experiment: [...answer[mapping.experimentalSide]].sort(), baseline: [...answer[other]].sort() }
  }
  const primary = key.pages.filter((p) => !p.repeatOf)
  const repeats = key.pages.filter((p) => p.repeatOf)
  assert.equal(primary.length, 12)
  assert.equal(repeats.length, 4)
  for (const repeat of repeats) {
    const parent = primary.find((p) => p.id === repeat.repeatOf)
    assert(parent, 'repeat must point to a primary')
    const p = study.pages.find((p) => p.id === parent.id)
    const r = study.pages.find((p) => p.id === repeat.id)
    assert.equal(p.brief, r.brief)
    assert.deepEqual(p.left, r.right)
    assert.deepEqual(p.right, r.left)
    assert.notEqual(parent.experimentalSide, repeat.experimentalSide)
  }
  const values = primary.map(normalized)
  const wins = values.filter((a) => a.preference === 'experiment').length
  const usableExperiment = values.filter((a) => a.experiment.length > 0).length
  const usableBaseline = values.filter((a) => a.baseline.length > 0).length
  const consistentRepeats = repeats.filter((p) => JSON.stringify(normalized(p)) === JSON.stringify(normalized(key.pages.find((v) => v.id === p.repeatOf)))).length
  const gates = { wins: wins >= studyProtocol.humanGate.minimumWins, usable: usableExperiment >= studyProtocol.humanGate.minimumUsableBriefs,
    uplift: usableExperiment - usableBaseline >= studyProtocol.humanGate.minimumUsableBriefUplift, consistency: consistentRepeats >= studyProtocol.humanGate.minimumConsistentRepeats }
  return { wins, usableExperiment, usableBaseline, consistentRepeats, gates, eligibleForPromotionReview: Object.values(gates).every(Boolean) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  if (!input) throw Error('Usage: node research/shared-pool/study-tools.mjs path/to/exported-choices.json')
  const study = JSON.parse(readFileSync(resolve(dir, 'artifacts/blind-study.json'), 'utf8'))
  const key = JSON.parse(readFileSync(resolve(dir, 'artifacts/study-key.private.json'), 'utf8'))
  const manifest = JSON.parse(readFileSync(resolve(dir, 'artifacts/study-manifest.json'), 'utf8'))
  assert.equal(hash(JSON.stringify(key)), manifest.keySha256, 'answer key differs from packed manifest')
  assert.equal(hash(readFileSync(resolve(dir, 'artifacts/comparison.json'))), key.comparisonSha256)
  console.log(JSON.stringify(scoreStudy(study, key, JSON.parse(readFileSync(resolve(input), 'utf8'))), null, 2))
}
