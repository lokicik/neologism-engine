import protocolJson from '../protocol.json'
import { generateBatch } from '../../../web/src/lib/engine'

const NAME = /^[A-Za-z]{4,12}$/
const POOL_SIZE = 24

async function namesFor(seed: number, description?: string): Promise<string[]> {
  const pool = await generateBatch({
    style: protocolJson.poolPolicy.style as 'big_tech',
    count: protocolJson.poolPolicy.count,
    min_len: protocolJson.poolPolicy.minLength,
    max_len: protocolJson.poolPolicy.maxLength,
    temperature: protocolJson.poolPolicy.temperature,
    variety: protocolJson.poolPolicy.variety,
    roots: protocolJson.poolPolicy.roots,
    variant: protocolJson.poolPolicy.variant,
    description,
    seed,
  })
  return pool.map((row) => row.name)
}

function eligible(names: string[]): boolean {
  return names.length === POOL_SIZE
    && names.every((name) => NAME.test(name))
    && new Set(names.map((name) => name.toLowerCase())).size === POOL_SIZE
}

async function run(): Promise<void> {
  const rows = []
  for (const brief of protocolJson.briefs) {
    const first = await namesFor(brief.seed)
    const second = await namesFor(brief.seed)
    const conditioned = await namesFor(brief.seed, brief.brief)
    rows.push({
      id: brief.id,
      seed: brief.seed,
      promptIndependentCount: first.length,
      promptIndependentEligible: eligible(first),
      promptIndependentDeterministic: JSON.stringify(first) === JSON.stringify(second),
      briefConditionedCount: conditioned.length,
    })
  }
  document.getElementById('result')!.textContent = JSON.stringify(rows, null, 2)
  document.body.dataset.complete = 'true'
}

void run().catch((error: unknown) => {
  document.getElementById('result')!.textContent = String(error)
  document.body.dataset.error = 'true'
})
