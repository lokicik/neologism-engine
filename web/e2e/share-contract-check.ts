import type { NameResult } from '../src/lib/engine.ts'
import { decodeShareUrl, encodeShareUrl } from '../src/lib/share.ts'

const fakeLocation = {
  origin: 'https://names.example',
  pathname: '/app',
  hash: '',
}
Object.defineProperty(globalThis, 'location', {
  value: fakeLocation,
  configurable: true,
})

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(message)
  console.log(`PASS  ${message}`)
}

function setPayload(value: unknown): void {
  fakeLocation.hash = `#names=${btoa(JSON.stringify(value))}`
}

setPayload([
  { n: ' Noma ', s: 'big_tech' },
  { n: 'Mythra', s: 'fantasy' },
  {},
  { n: 'BadStyle', s: 'unknown' },
  { n: 'Bad\nName', s: 'big_tech' },
  { n: 'x'.repeat(81), s: 'sci_fi' },
])
check(
  JSON.stringify(decodeShareUrl()) === JSON.stringify([
    { name: 'Noma', style: 'big_tech' },
    { name: 'Mythra', style: 'fantasy' },
  ]),
  'share decoding trims valid rows and discards malformed or unsafe rows',
)

setPayload(Array.from({ length: 205 }, (_, index) => ({ n: `Name${index}`, s: 'big_tech' })))
check(decodeShareUrl().length === 0, 'oversized share collections fail closed without truncation')

fakeLocation.hash = `#names=${'A'.repeat(32_768)}`
check(decodeShareUrl().length === 0, 'oversized share hashes fail closed')
fakeLocation.hash = '#names=not-base64'
check(decodeShareUrl().length === 0, 'malformed share payloads fail closed')

const result: NameResult = {
  name: 'Noma',
  style: 'big_tech',
  sourceMode: 'brandable',
  tasteContext: { id: 'private-project', description: 'private brief', roots: ['secret'] },
  syllables: 2,
  score_pronounce: 90,
  score_novelty: 91,
  score_memorability: 92,
  connotations: ['calm'],
}
const url = encodeShareUrl([result])
const raw = JSON.parse(atob(url.split('#names=')[1]))
check(
  JSON.stringify(raw) === JSON.stringify([{ n: 'Noma', s: 'big_tech' }]),
  'forwarded share payloads contain only spelling and style, never feedback or project context',
)

const unicodeResult = { ...result, name: 'İsim✨' }
const unicodeUrl = encodeShareUrl([unicodeResult])
fakeLocation.hash = `#names=${unicodeUrl.split('#names=')[1]}`
check(
  JSON.stringify(decodeShareUrl()) === JSON.stringify([{ name: 'İsim✨', style: 'big_tech' }]),
  'a valid imported Unicode spelling can be forwarded without loss',
)

const twoHundred = Array.from({ length: 200 }, (_, index) => ({
  ...result,
  name: `Name${index}`,
}))
const cappedUrl = encodeShareUrl(twoHundred)
fakeLocation.hash = `#names=${cappedUrl.split('#names=')[1]}`
check(decodeShareUrl().length === 200, 'the maximum supported share collection round-trips intact')
let rejectedOversize = false
try {
  encodeShareUrl([...twoHundred, { ...result, name: 'Name200' }])
} catch {
  rejectedOversize = true
}
check(rejectedOversize, 'the sender rejects 201 names instead of creating a lossy link')

const escapedName = '\\"'.repeat(40)
let rejectedLongHash = false
try {
  encodeShareUrl(Array.from({ length: 200 }, (_, index) => ({
    ...result,
    name: `${index.toString().padStart(3, '0')}${escapedName}`.slice(0, 80),
  })))
} catch {
  rejectedLongHash = true
}
check(rejectedLongHash, 'the sender preflights the same hash-size limit enforced by the receiver')

console.log('share contract check: all checks passed')
