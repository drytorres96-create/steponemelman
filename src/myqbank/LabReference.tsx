import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Button, Card, Icon, Segmented } from './components'
import { HighlightText, type HighlightSource } from './HighlightText'
import { filterLabSections, LAB_SECTIONS, LAB_SOURCE } from './lab-values'
import './lab-reference.css'

// Preserve exact text and region keys of the original ten rows so saved marks stay anchored.
const legacyNames: Record<string, string> = { sodium: 'Sodium', potassium: 'Potassium', chloride: 'Chloride', bicarbonate: 'Bicarbonate', bun: 'Urea nitrogen', creatinine: 'Creatinine', 'glucose-fasting': 'Glucose · fasting', calcium: 'Calcium', phosphorus: 'Phosphorus', albumin: 'Albumin' }
const regionFor = (id: string, field: 'name' | 'reference' | 'si') => legacyNames[id]
  ? `${legacyNames[id]}:${{ name: 0, reference: 1, si: 2 }[field]}` : `${id}:${field}`

// Owned by Study, so moving or closing the panel never resets the lookup.
export function useLabReference() {
  const [search, setSearch] = useState('')
  const [sectionId, setSectionId] = useState('all')
  const [units, setUnits] = useState<'reference' | 'si'>('reference')
  const scroll = useRef(0)
  return { search, setSearch, sectionId, setSectionId, units, setUnits, scroll }
}
export function LabReference({ source, view }: {source?: HighlightSource; view: ReturnType<typeof useLabReference>}) {
  const {search, setSearch, sectionId, setSectionId, units, setUnits, scroll} = view
  const list = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = scroll.current }, [scroll])
  const id = useId()
  const sections = filterLabSections(search, sectionId)
  const count = sections.reduce((total, section) => total + section.rows.length, 0)
  const text = (value: string, region: string) => source
    ? <HighlightText text={value} source={source} region={`reference:${region}`}/>
    : value
  const resetScroll = () => { scroll.current = 0; if (list.current) list.current.scrollTop = 0 }
  return <Card className="mq-lab-reference" aria-label="Lab reference">
    <header className="mq-lab-heading"><span className="mq-lab-emblem"><Icon name="labs"/></span><div><h2>Lab reference</h2><p>USMLE · {LAB_SOURCE.edition} · all sections</p></div></header>
    <div className="mq-lab-search"><Icon name="search"/><label className="mq-sr-only" htmlFor={`${id}-search`}>Find a test</label>
      <input id={`${id}-search`} ref={searchInput} value={search} onChange={e => { setSearch(e.target.value); setSectionId('all'); resetScroll() }} type="search" placeholder="Find a test or abbreviation…" autoComplete="off"/>
      {search && <Button aria-label="Clear lab search" onClick={() => { setSearch(''); resetScroll(); searchInput.current?.focus() }}><Icon name="close"/></Button>}
    </div>
    <div className="mq-lab-controls"><label className="mq-sr-only" htmlFor={`${id}-section`}>Lab section</label><select id={`${id}-section`} value={sectionId} onChange={e => { setSectionId(e.target.value); setSearch(''); resetScroll() }}>
      <option value="all">All sections</option>{LAB_SECTIONS.map(section => <option value={section.id} key={section.id}>{section.label}</option>)}
    </select><Segmented label="Lab units" value={units} onChange={setUnits} options={[{value:'reference',label:'Conventional'},{value:'si',label:'SI'}]}/></div>
    <p className="mq-lab-count" role="status">{count} reference entries{search.trim() ? ` matching “${search.trim()}”` : ''}</p>
    <div ref={list} className="mq-lab-scroll" onScroll={e => { scroll.current = e.currentTarget.scrollTop }} tabIndex={0} role="region" aria-label="Laboratory reference values">
      {sections.map(section => <section className="mq-lab-section" key={section.id} aria-labelledby={`${id}-${section.id}`}>
        <div className="mq-lab-section-heading"><h3 id={`${id}-${section.id}`}>{text(section.label, `section:${section.id}:label`)}</h3><span>{text(section.specimen, `section:${section.id}:context`)}</span></div>
        <table aria-labelledby={`${id}-${section.id}`}><thead><tr><th scope="col">Test</th><th scope="col">{units === 'si' ? 'SI reference' : 'Reference range'}</th></tr></thead>
          <tbody>{section.rows.map(row => <tr key={row.id}><th scope="row">{text(legacyNames[row.id] ?? row.name, regionFor(row.id, 'name'))}{row.context && row.id !== 'glucose-fasting' && <span className="mq-lab-context">{text(row.context, `${row.id}:context`)}</span>}</th>
            <td>{text(row[units] ?? row.reference, regionFor(row.id, row[units] === null ? 'reference' : units))}{units === 'si' && row.si === null && <span className="mq-lab-context">No separate SI interval in source.</span>}</td></tr>)}</tbody>
        </table>
      </section>)}
      {!count && <div className="mq-lab-empty"><Icon name="search"/><strong>No matching tests</strong><p>Try a test name, abbreviation or section.</p><Button onClick={() => { setSearch(''); setSectionId('all'); resetScroll(); searchInput.current?.focus() }}>Show all sections</Button></div>}
    </div>
    <footer className="mq-lab-footer"><p>Exam reference ranges. Patient results stay in the vignette.</p><a href={LAB_SOURCE.url} target="_blank" rel="noreferrer">USMLE source · pp. {LAB_SOURCE.pages}<Icon name="external"/><span className="mq-sr-only"> (PDF, opens in a new tab)</span></a></footer>
  </Card>
}
