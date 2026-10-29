import { test, expect, type Page } from '@playwright/test'
import { EVALUADOR_VERSION } from '../src/lib/normalize'
const url='/?workspace=myqbank&proveedor=nbme-real&escena=abierto'
async function start(page:Page, mode='Tutor') {
 let requests=0
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/api/nbme/catalog')return route.fulfill({json:{schemaVersion:1,bankVersion:'qa',total:0,questions:[]}})
  if(path==='/api/calificar'){requests++;return route.fulfill({json:{veredicto:'parcial',motivo:'Falta una parte de la respuesta sintética.'}})}
  return route.fulfill({status:503,json:{error:'Synthetic backend unavailable.'}})
 })
 await page.goto(url)
 await page.getByRole('button',{name:'Mehlman Concepts',exact:true}).click()
 await page.getByText('More filters',{exact:true}).click()
 await page.getByLabel('Search concepts or ID',{exact:true}).fill('recuperacion_libre')
 await page.getByRole('button',{name:mode,exact:true}).click()
 await page.getByRole('button',{name:'Start 1-question block'}).click()
 return ()=>requests
}
const attempts=(page:Page)=>page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).progreso).flatMap((p:any)=>p.intentos))
test('accepted answers bypass a contradictory model and keep an independent grade',async({page})=>{
 const requests=await start(page)
 await page.locator('.mq-concept-interaction input').fill('ALPHA')
 await page.getByRole('button',{name:'Submit answer',exact:true}).click()
 await expect(page.locator('.mq-result')).toHaveText('Correct')
 expect(requests()).toBe(0)
 expect(await attempts(page)).toEqual([expect.objectContaining({resultado:'correcta',explicacion_previa:false,evaluador_version:EVALUADOR_VERSION})])
 expect((await attempts(page))[0].calificado_por_ia).toBeUndefined()
})
for(const mode of ['Tutor','Test'])test(`partial result and reason persist; ${mode} respects feedback timing`,async({page})=>{
 const requests=await start(page,mode)
 await page.locator('.mq-concept-interaction input').fill('partial phrase')
 await page.getByRole('button',{name:'Submit answer',exact:true}).click()
 await expect(page.getByText('Answer saved · checking the response…',{exact:true})).toHaveCount(0)
 if(mode==='Test'){
  await expect(page.getByText('Answer saved',{exact:true})).toBeVisible()
  await expect(page.getByText(/AI-assisted grading/)).toHaveCount(0)
  await expect(page.getByRole('region',{name:'Expected answer',exact:true})).toHaveCount(0)
  await expect(page.getByText('Falta una parte de la respuesta sintética.',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'End block',exact:true}).click()
  await page.getByRole('button',{name:'End and review',exact:true}).click()
 }
 await expect(page.locator('.mq-result')).toHaveText('Partially correct')
 await expect(page.getByRole('region',{name:'Expected answer',exact:true}).locator('.mq-expected-wording')).toHaveText('alpha')
 await expect(page.getByText('Falta una parte de la respuesta sintética.',{exact:true})).toBeVisible()
 expect(requests()).toBe(1)
 await page.getByRole('button',{name:mode==='Test'?'Dashboard':'Pause',exact:true}).click()
 await page.reload()
 if(mode==='Test') {
  await page.getByText('Saved blocks',{exact:true}).click()
  await page.getByRole('button',{name:/ · Review$/}).first().click()
 } else await page.getByRole('button',{name:'Resume block',exact:true}).click()
 await expect(page.locator('.mq-result')).toHaveText('Partially correct')
 await expect(page.getByRole('region',{name:'Expected answer',exact:true}).locator('.mq-expected-wording')).toHaveText('alpha')
 await expect(page.getByText('Falta una parte de la respuesta sintética.',{exact:true})).toBeVisible()
 expect(await attempts(page)).toEqual([expect.objectContaining({resultado:'parcial',tipo_error:'recuerdo_incompleto',calificado_por_ia:true})])
 await expect(page.getByRole('button',{name:'Recheck accepted answer',exact:true})).toHaveCount(0)
})
test('recheck an old AI grade retains one assisted attempt across reload',async({page})=>{
 await start(page)
 await page.getByRole('button',{name:'Learn this concept',exact:true}).click()
 await page.getByRole('button',{name:'Practice recall',exact:true}).click()
 await page.locator('.mq-concept-interaction input').fill('alpha')
 await page.getByRole('button',{name:'Submit answer',exact:true}).click()
 await expect(page.locator('.mq-result')).toHaveText('Correct with help')
 await page.getByRole('button',{name:'Pause',exact:true}).click()
 const before=await page.evaluate(()=>{
  const s=JSON.parse(localStorage.getItem('qa-myqbank-state')!)
  const p=Object.values(s.progreso)[0] as any
  const a=p.intentos[0]
  Object.assign(a,{resultado:'parcial',calificacion:2,evaluador_version:'2.4.0',calificado_por_ia:true,motivo_calificacion_ia:'Old synthetic decision.'})
  localStorage.setItem('qa-myqbank-state',JSON.stringify(s))
  return a
 })
 await page.reload();await page.getByRole('button',{name:'Resume block',exact:true}).click()
 await expect(page.locator('.mq-result')).toHaveText('Partially correct')
 await expect(page.getByRole('region',{name:'Expected answer',exact:true}).locator('.mq-expected-wording')).toHaveText('alpha')
 await page.getByRole('button',{name:'Recheck accepted answer',exact:true}).click()
 await expect(page.locator('.mq-result')).toHaveText('Correct with help')
 await expect(page.getByRole('button',{name:'Recheck accepted answer',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Pause',exact:true}).click()
 await page.reload();await page.getByRole('button',{name:'Resume block',exact:true}).click()
 await expect(page.locator('.mq-result')).toHaveText('Correct with help')
 const saved=await attempts(page)
 expect(saved).toHaveLength(1)
 expect(saved[0]).toMatchObject({...before,resultado:'correcta',calificacion:3,tipo_error:'correcta_con_pistas',correccion_manual:true,evaluador_version:EVALUADOR_VERSION})
 expect(saved[0].calificacion_actualizada_en).toBeGreaterThanOrEqual(before.ts)
})

test('learning reveals literal accepted wording and hides it again before recall',async({page})=>{
 const requests=await start(page)
 const answer=page.getByRole('region',{name:'Expected answer',exact:true})
 await expect(answer).toHaveCount(0)
 await page.getByRole('button',{name:'Learn this concept',exact:true}).click()
 await expect(answer.locator('.mq-expected-wording')).toHaveText('alpha')
 await expect(answer.locator('li')).toHaveText(['first element'])
 const word=answer.locator('.mq-expected-wording .mq-highlight-text')
 await word.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const s=getSelection()!;s.removeAllRanges();s.addRange(range);el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))})
 await expect(answer.locator('mark')).toHaveText('alpha')
 await page.getByRole('button',{name:'Practice recall',exact:true}).click()
 await expect(answer).toHaveCount(0)
 await page.locator('.mq-concept-interaction input').fill('first element')
 await page.getByRole('button',{name:'Submit answer',exact:true}).click()
 await expect(page.locator('.mq-result')).toHaveText('Correct with help')
 await expect(answer.locator('mark')).toHaveText('alpha')
 expect(requests()).toBe(0)
 expect(await attempts(page)).toEqual([expect.objectContaining({respuesta_dada:'first element',explicacion_previa:true,resultado:'correcta'})])
})
