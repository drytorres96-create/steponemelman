import { describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { explanationHash, sourceIdentity, type EditorialExplanation } from './editorial'
import { prepareEditorialRelease, type EditorialCandidate } from './release'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
async function fixture():Promise<EditorialCandidate> {
  Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true})
  const source=await sourceIdentity(myqbankConcepts[0])
  const explanation:EditorialExplanation={schemaVersion:1,language:'es',version:'qa-reviewed',source,review:'approved',
    sections:[{id:'idea',label:'Key idea',heading:'Ejemplo',status:'available',paragraphs:["Ejemplo sintético con ' comilla y $release$ y $myqbank_release_0$."]}],
    evidence:[{sectionId:'idea',sourceRef:'https://example.org/synthetic',locator:'Synthetic QA only'}]}
  explanation.independentReview={author:'QA author',reviewer:'QA reviewer',kind:'ai',reviewedAt:'2026-10-14T12:00:00Z',sourceHash:source.sourceHash,contentHash:await explanationHash(explanation)}
  const concept=myqbankConcepts[0]
  const module={module_id:'QA',nombre:'QA',proposito:'QA',prerrequisitos:[],disciplinas:[],sistemas:[],temas:[],n_conceptos:1,minutos_estimados:1,cobertura_documental:[],orden:0,
    sesiones:[{session_id:'QA',titulo:'QA',objetivo:'QA',conceptos:[concept.concept_id]}]}
  return {explanation,proof:{original:{table:'corpus_assets',path:'modules/QA.json',md5:'a'.repeat(32),payload:{module_id:'QA',conceptos:[concept]}},
    index:{table:'corpus_assets',path:'index.json',md5:'b'.repeat(32),payload:{schema_version:'1',corpus_version:'1.0.0',n_conceptos:1,modulos:[module],glosario:[],documentos:[],cuarentena:0}},context:{kind:'base'}},sourceAssertions:[],previous:null,unresolvedIssues:[]}
}
describe('atomic editorial release preparation',()=>{
  it('requires a real review, intact text, original snapshot, unique targets and resolved issues',async()=>{
    const c=await fixture()
    await expect(prepareEditorialRelease('qa-release',[{...c,unresolvedIssues:['unresolved']}])).rejects.toThrow()
    await expect(prepareEditorialRelease('qa-release',[{...c,proof:{...c.proof,original:{...c.proof.original,path:'modules/UNRELATED.json'}}}])).rejects.toThrow()
    await expect(prepareEditorialRelease('qa-release',[c,c])).rejects.toThrow()
    await expect(prepareEditorialRelease('qa-release',[{...c,explanation:{...c.explanation,review:'pending'}}])).rejects.toThrow()
    const altered={...c.explanation,sections:[{...c.explanation.sections[0],paragraphs:['Changed claim']} ]}
    await expect(prepareEditorialRelease('qa-release',[{...c,explanation:altered}])).rejects.toThrow()
  })
  it('binds the previous adaptation to its rollback hash in PostgreSQL',async()=>{
    const c=await fixture()
    const release=await prepareEditorialRelease('qa-release',[{...c,previous:{payload:{old:true},md5:'c'.repeat(32)}}])
    expect(release.publishSql).toContain('Rollback payload does not match its hash')
    expect(release.publishSql).toContain('md5((')
    expect(release.rollbackSql).toContain('{"old":true}')
  })
  it('preserves originals, scopes the audit to the permission bucket and refuses stale rollback',async()=>{
    const release=await prepareEditorialRelease('qa-release',[await fixture()])
    expect(release.count).toBe(1)
    expect(release.publishSql).toContain('Source or target changed')
    expect(release.publishSql).toContain('Snapshot payload does not match its hash')
    expect(release.publishSql).toContain('Target already exists')
    expect(release.publishSql).toContain("'' comilla")
    expect(release.publishSql).toContain('do $myqbank_release_1$ begin')
    expect(release.publishSql).not.toContain('insert into public.nbme_assets')
    expect(release.publishSql).not.toMatch(/update public\.(study_state|nbme_state)/)
    expect(release.rollbackSql).toContain('Published adaptation changed; rollback refused')
    expect(release.rollbackSql).not.toContain("where path='modules/QA.json'")
  })
})
