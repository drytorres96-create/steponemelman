import { useState } from 'react'
import { Card } from './components'
// Factual ranges checked against the USMLE April 2026 public sample booklet, p. 7.
// Deliberately separate from patient data. Use the full official table for other tests.
const rows = [
  ['Sodium', '136–146 mEq/L', '136–146 mmol/L'], ['Potassium', '3.5–5.0 mEq/L', '3.5–5.0 mmol/L'],
  ['Chloride', '95–105 mEq/L', '95–105 mmol/L'], ['Bicarbonate', '22–28 mEq/L', '22–28 mmol/L'],
  ['Urea nitrogen', '7–18 mg/dL', '2.5–6.4 mmol/L'], ['Creatinine', '0.6–1.2 mg/dL', '53–106 μmol/L'],
  ['Glucose · fasting', '70–100 mg/dL', '3.8–5.6 mmol/L'], ['Calcium', '8.4–10.2 mg/dL', '2.1–2.6 mmol/L'],
  ['Phosphorus', '3.0–4.5 mg/dL', '1.0–1.5 mmol/L'], ['Albumin', '3.5–5.5 g/dL', '35–55 g/L'],
] as const
export function LabReference() {
  const [search, setSearch] = useState('')
  return <Card className="mq-lab-reference" aria-label="Lab reference"><h2>Lab reference</h2><p className="mq-small mq-muted">Common serum reference ranges. Patient values remain in the question.</p>
    <label className="mq-field">Find a test<input value={search} onChange={e => setSearch(e.target.value)} type="search"/></label>
    <div className="mq-table-scroll" tabIndex={0}><table><thead><tr><th>Test</th><th>Reference</th><th>SI</th></tr></thead><tbody>{rows.filter(r => r[0].toLowerCase().includes(search.toLowerCase())).map(r => <tr key={r[0]}>{r.map((v, i) => i === 0 ? <th scope="row" key={i}>{v}</th> : <td key={i}>{v}</td>)}</tr>)}</tbody></table></div>
    <a href="https://www.usmle.org/sites/default/files/2021-10/Step_1_Sample_Items.pdf#page=8" target="_blank" rel="noreferrer">Full USMLE reference table · April 2026, pp. 7–9</a>
  </Card>
}
