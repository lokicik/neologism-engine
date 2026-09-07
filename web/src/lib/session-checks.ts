import { normalizeDomainLabel, type DomainObservation } from './domain'

// Display evidence within this app session only; neither preferences nor
// availability claims are inferred from opening a comparison.
const checks = new Map<string, DomainObservation[]>()
export function rememberNameChecks(name: string, observations: DomainObservation[]) {
  const label = normalizeDomainLabel(name)
  if (!label) return
  const completed = observations.filter(item => item.host === `${label}${item.tld}` && item.checkedAt !== null && item.status !== 'checking' && item.status !== 'idle')
  if (!completed.length) return
  const previous = checks.get(label) ?? []
  checks.set(label, [...previous.filter(item => !completed.some(next => next.tld === item.tld)), ...completed])
}
export function nameChecks(name: string): DomainObservation[] { return checks.get(normalizeDomainLabel(name) ?? '') ?? [] }
export function checkLabel(observation: DomainObservation): string {
  const labels: Record<DomainObservation['status'], string> = {
    idle: 'Not run', checking: 'Checking…', record_found: 'Registration record found', no_record: 'No registration record found', dns_record: 'DNS record observed', nxdomain: 'NXDOMAIN observed', no_a_answer: 'No A answer', rate_limited: 'Provider rate limited', inconclusive: 'Inconclusive',
  }
  return labels[observation.status]
}
