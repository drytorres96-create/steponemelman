import { test, expect } from '@playwright/test'
import { ESTADO_INICIAL, reconstruirProgreso } from '../src/store/model'
import type { Intento } from '../src/srs/tipos'
const now=new Date('2026-10-14T16:00:00Z').getTime()
const older=now-4*86_400_000
const ids=['QA-FORMAT-0','QA-FORMAT-1']
const historical=(id:string):Intento=>({attempt_id:`old-${id}`,session_id:'old-session',ts:older,calificacion:1,resultado:'incorrecta',
 interaccion:'recuperacion_libre',recuperacion_activa:true,pistas_usadas:0,ms:5000,tipo_error:'confusion_conceptos',confianza_declarada:null,respuesta_dada:'beta'})
for(const width of [390,1280])test(`due items stay in MyQBank, advance and resume at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900})
 await page.clock.setFixedTime(now)
 const state={...ESTADO_INICIAL,progreso:Object.fromEntries(ids.map(id=>[id,reconstruirProgreso(id,[historical(id)],ESTADO_INICIAL.criterios)]))}
 await page.addInitScript(s=>{if(!localStorage.getItem('qa-myqbank-state'))localStorage.setItem('qa-myqbank-state',JSON.stringify(s))},state)
 await page.route('**/api/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/catalog')?{schemaVersion:1,bankVersion:'qa',total:0,questions:[]}:{error:'Synthetic only'}}))
 await page.goto('/?workspace=myqbank&proveedor=nbme-real&escena=abierto')
 await page.getByRole('button',{name:'Review due items',exact:true}).click()
 await expect(page.locator('.mq-study')).toBeVisible()
 await expect(page.locator('.mq-legacy-study')).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Question 1',exact:true})).toBeVisible()
 const entries=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).myqbankBlocks).flatMap((b:any)=>b.entries.map((e:any)=>e.id)))
 expect(entries).toEqual(ids)
 await page.locator('.mq-concept-interaction input').fill('alpha')
 await page.getByRole('button',{name:'Submit answer',exact:true}).click()
 await expect(page.locator('.mq-result')).toHaveText('Correct')
 // Long explanatory content must remain internally scrollable on desktop.
 await page.locator('.mq-explanation-content').evaluate(el=>{el.append(document.createTextNode(' Synthetic explanatory text.'.repeat(800)))})
 const next=page.locator('.mq-explanation-pane').getByRole('button',{name:'Next question',exact:true})
 await next.scrollIntoViewIfNeeded()
 await expect(next).toBeInViewport()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 if(width>960){
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true)
  expect(await page.locator('.mq-explanation-pane').evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
 }
 await next.click()
 await expect(page.getByRole('heading',{name:'Question 2',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Pause',exact:true}).click()
 await page.reload();await page.getByRole('button',{name:'Resume block',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Question 2',exact:true})).toBeVisible()
 await expect(page.locator('.mq-legacy-study')).toHaveCount(0)
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-myqbank-state')!))
 expect(saved.progreso[ids[0]].intentos).toHaveLength(2)
 expect(saved.progreso[ids[0]].intentos[0]).toEqual(historical(ids[0]))
 expect(saved.progreso[ids[1]].intentos).toEqual([historical(ids[1])])
})
test('new daily items use the same MyQBank player',async({page})=>{
 await page.clock.setFixedTime(now)
 await page.route('**/api/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/catalog')?{schemaVersion:1,bankVersion:'qa',total:0,questions:[]}:{error:'Synthetic only'}}))
 await page.goto('/?workspace=myqbank&proveedor=nbme-real&escena=abierto')
 await page.getByRole('button',{name:"Study today's new items",exact:true}).click()
 await expect(page.locator('.mq-study')).toBeVisible()
 await expect(page.locator('.mq-legacy-study')).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Question 1',exact:true})).toBeVisible()
})
