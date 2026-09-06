import { cratesTaken } from '../lib/engine'
import type { SavedNameEntry } from '../lib/taste-identity'
import { nameHint } from './DiscoveryCard'
import { NameDialog } from './NameDetails'

export function NameComparison({ entries, onClose }: { entries: SavedNameEntry[]; onClose: () => void }) {
  const checks = Object.fromEntries(entries.map(({ result }) => [result.name, cratesTaken(result.name)]))
  return <NameDialog title="Compare names" label="comparison" wide onClose={onClose}>
    <p className="comparison-intro">Read them side by side. The choice is yours.</p>
    <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Name comparison table, scroll horizontally on small screens">
      <table className="name-comparison">
        <caption className="visually-hidden">Meaning, syllables, and local snapshot checks for your selected names</caption>
        <thead><tr><th scope="col">Name</th>{entries.map(({ result }) => <th scope="col" key={result.name}>{result.name}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Meaning / construction</th>{entries.map(({ result }) => <td key={result.name}>{nameHint(result) ?? 'No construction evidence recorded.'}</td>)}</tr>
          <tr><th scope="row">Syllables</th>{entries.map(({ result, explicitLikes }) => <td key={result.name}>{explicitLikes > 0 && result.syllables > 0 ? result.syllables : 'Not recorded'}</td>)}</tr>
          <tr><th scope="row">Local snapshot</th>{entries.map(({ result }) => <td key={result.name}>{checks[result.name] === undefined ? 'Snapshot not loaded in this session.' : checks[result.name] ? 'Potential match in local snapshot' : 'No match in local snapshot'}</td>)}</tr>
          <tr><th scope="row">Live checks</th>{entries.map(({ result }) => <td key={result.name}>Not run in this comparison.</td>)}</tr>
        </tbody>
      </table>
    </div>
    <p className="snapshot-note">The local snapshot combines package and brand records. Matches may be false positives; absence is not availability. Open a name’s Details to run current domain checks.</p>
  </NameDialog>
}
