import { test, expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
const url='/?workspace=myqbank&proveedor=nbme-real&escena=abierto'
const stable=(value:any):string=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`:JSON.stringify(value)
const hash=(value:any)=>createHash('sha256').update(stable(value)).digest('hex')
function editorial(id:string, single=false) {
  const q=preguntaNbmeReal(id),{stem,options,answer,explanation,figures,objective}=q
  const source={kind:'nbme',id,revision:q.revision,sourceHash:hash({stem,options,answer,explanation,figures,objective})}
  const content={schemaVersion:1,language:'es',version:'synthetic-review-1',source,
    sections:[{id:'stem',label:'Read the stem',heading:`Pistas de ${id}`,status:'available',paragraphs:[Array.from({length:12},(_,i)=>`La muestra sintética ${i+1} conserva 1.5 unidades y no contiene datos clínicos.`).join(' ')]},
      ...single?[]:[{id:'drills',label:'Drills',heading:'Práctica sintética',status:'available',drill:{prompt:'¿Cuál es la referencia sintética?',answer:'La referencia sintética es C.'}}]],
    evidence:[{sectionId:'stem',sourceRef:'https://example.org/qa',locator:'Synthetic QA only'},...single?[]:[{sectionId:'drills',sourceRef:'https://example.org/qa',locator:'Synthetic QA only'}]]}
  return {path:`myqbank/explanations/v1/${id}/${q.revision}/base.json`,payload:{...content,review:'approved',independentReview:{author:'Synthetic writer',reviewer:'Synthetic independent reviewer',kind:'ai',reviewedAt:'2026-10-14T12:00:00Z',sourceHash:source.sourceHash,contentHash:hash(content)}}}
}
async function setup(page:Page, single=false) {
  const qs=Array.from({length:5},(_,i)=>({...preguntaNbmeReal(`QA-EDITORIAL-${i+1}`),systems:['Renal']}))
  await page.route('**/api/**',r=>{
    const path=new URL(r.request().url()).pathname
    if(path.endsWith('/catalog'))return r.fulfill({json:{schemaVersion:1,bankVersion:'synthetic-editorial',total:qs.length,questions:qs}})
    if(path.endsWith('/questions'))return r.fulfill({json:{questions:r.request().postDataJSON().refs.map((ref:any)=>preguntaNbmeReal(ref.id,ref.revision))}})
    return r.fulfill({status:503,json:{error:'Synthetic QA'}})
  })
  const assets=Object.fromEntries(qs.map(q=>{const e=editorial(q.id,single);return[e.path,e.payload]}))
  await page.addInitScript(assets=>{window.__qaEditorialAssets=assets},assets)
  await page.goto(url);await page.getByRole('button',{name:'Start 5-question block'}).click()
}
async function answer(page:Page) {
  await page.getByText('Synthetic saved option C',{exact:true}).click()
  await page.getByRole('button',{name:'Submit answer',exact:true}).click()
}
test('reviewed sections support keyboard, hidden drills, sources and continuation without forced tabs',async({page})=>{
  await setup(page);await answer(page)
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(page.getByRole('heading',{name:'Pistas de QA-EDITORIAL-1',exact:true})).toBeVisible()
  await page.getByRole('tab',{name:/Read the stem/}).focus();await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab',{name:/Drills/})).toBeFocused()
  await expect(page.getByText('La referencia sintética es C.',{exact:true})).toBeHidden()
  await page.getByRole('button',{name:'Reveal answer',exact:true}).click()
  await expect(page.getByText('La referencia sintética es C.',{exact:true})).toBeVisible()
  await page.getByText('Sources for this section',{exact:true}).click()
  await expect(page.getByRole('link',{name:'example.org',exact:true})).toHaveAttribute('href','https://example.org/qa')
  await page.locator('.mq-explanation-actions').getByRole('button',{name:'Next question'}).click()
  await expect(page.getByRole('heading',{name:'Question 2',exact:true})).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
})
test('single long section and labs fit desktop panels and remain readable after expanding',async({page})=>{
  await page.setViewportSize({width:1280,height:844});await setup(page,true)
  await page.getByRole('button',{name:'Labs',exact:true}).click();await answer(page)
  await expect(page.getByRole('heading',{name:'Pistas de QA-EDITORIAL-1'})).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await page.getByRole('button',{name:'Read full explanation'}).click()
  await expect(page.locator('.mq-question-pane').getByLabel('Lab reference',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}))).toEqual({x:false,y:false})
  const content=await page.locator('.mq-explanation-content').boundingBox()
  expect(content!.height).toBeGreaterThan(300)
  const lab=page.locator('.mq-lab-reference .mq-highlight-text').first()
  await lab.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const s=getSelection()!;s.removeAllRanges();s.addRange(range);el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))})
  await expect(lab.locator('mark')).toHaveCount(1)
  await lab.locator('mark').click();await expect(lab.locator('mark')).toHaveCount(0)
})
test('a stale response cannot cross questions; revoked adaptation cannot return from offline cache',async({page,context})=>{
  await setup(page)
  const first=editorial('QA-EDITORIAL-1')
  await page.evaluate(path=>{window.__qaEditorialDelay={[path]:700}},first.path)
  await answer(page)
  await page.getByRole('button',{name:'Next question',exact:true}).first().click();await answer(page)
  await expect(page.getByRole('heading',{name:'Pistas de QA-EDITORIAL-2'})).toBeVisible()
  await page.waitForTimeout(800)
  await expect(page.getByRole('heading',{name:'Pistas de QA-EDITORIAL-1'})).toHaveCount(0)
  const second=editorial('QA-EDITORIAL-2')
  await page.evaluate(path=>{window.__qaEditorialAssets![path]=null},second.path)
  await page.getByRole('button',{name:'Previous question'}).click()
  await page.getByRole('button',{name:'Next question',exact:true}).first().click()
  await expect(page.getByText('Original explanation',{exact:true}).last()).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await context.setOffline(true)
  await page.getByRole('button',{name:'Previous question'}).click()
  await page.getByRole('button',{name:'Next question',exact:true}).first().click()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await context.setOffline(false)
})
