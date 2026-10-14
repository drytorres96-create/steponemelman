import { test, expect, type Page } from '@playwright/test'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
const url = '/?workspace=myqbank&proveedor=nbme-real&escena=abierto'
async function network(page: Page, figure = false) {
  const batches: number[] = []
  const questions = Array.from({length: 85}, (_, i) => ({...preguntaNbmeReal(`QA-NBME-${i + 1}`), systems:['Renal']}))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/nbme/catalog') return route.fulfill({json:{schemaVersion:1,bankVersion:'synthetic-myqbank',total:questions.length,questions}})
    if (path === '/api/nbme/questions') {
      const refs = route.request().postDataJSON().refs as {id:string;revision:string}[]
      batches.push(refs.length)
      return route.fulfill({json:{questions:refs.map(r=>({...preguntaNbmeReal(r.id,r.revision),systems:['Renal'], ...(figure ? {figureRequired:true,figures:[{assetId:'QA-figure',alt:'Synthetic square'}]} : {})}))}})
    }
    return route.fulfill({status:503,json:{disponible:false,error:'Synthetic backend unavailable.'}})
  })
  return batches
}
test('80-item Test saves drafts and flags, resumes after reload, reveals only after closure', async ({page}) => {
  const batches = await network(page)
  await page.goto(url)
  await page.getByRole('button',{name:'Test',exact:true}).click()
  await page.getByRole('button',{name:'80',exact:true}).click()
  await page.getByRole('button',{name:'Start 80-question block'}).click()
  await expect(page.getByRole('heading',{name:'Question 1',exact:true})).toBeVisible()
  expect(batches.every(n=>n<=20)).toBe(true)
  expect(batches.reduce((a,b)=>a+b,0)).toBeGreaterThanOrEqual(80)
  await page.getByText('Synthetic saved option C',{exact:true}).click()
  await page.getByRole('button',{name:'Flag',exact:true}).click()
  await page.getByRole('button',{name:'Submit answer',exact:true}).click()
  await expect(page.getByText('Answer saved',{exact:true})).toBeVisible()
  await expect(page.getByLabel('Explanation',{exact:true})).toHaveCount(0)
  await expect(page.getByText('Correct answer',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Next question',exact:true}).last().click()
  await page.getByText('Synthetic saved option B',{exact:true}).click()
  await page.getByRole('button',{name:'Pause',exact:true}).click()
  await page.reload()
  await page.getByRole('button',{name:'Resume block',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Question 2',exact:true})).toBeVisible()
  await expect(page.locator('input[type=radio]:checked')).toHaveCount(1)
  await page.getByRole('button',{name:'End block',exact:true}).click()
  await page.getByRole('button',{name:'End and review',exact:true}).click()
  await expect(page.getByText('Not answered · no grade recorded.')).toBeVisible()
  await page.getByText('Question map',{exact:true}).click()
  await page.getByRole('button',{name:'Question 1, correct, flagged',exact:true}).click()
  await expect(page.getByText('Correct answer',{exact:true})).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByText('Synthetic saved explanation: option C follows from the demonstration.',{exact:true})).toBeVisible()
})
test('concept draft survives navigation and reload; every format remains available', async ({page}) => {
  await network(page); await page.goto(url)
  await page.getByRole('button',{name:'Mehlman Concepts',exact:true}).click()
  await page.getByRole('button',{name:'10',exact:true}).click()
  await page.getByRole('button',{name:'Start 10-question block'}).click()
  await expect(page.getByRole('heading',{name:'Question 1',exact:true})).toBeVisible()
  const text = page.getByRole('textbox').first()
  await text.fill('alpha')
  await page.getByRole('button',{name:'Next question',exact:true}).first().click()
  await page.getByRole('button',{name:'Previous question',exact:true}).click()
  await expect(text).toHaveValue('alpha')
  await page.getByRole('button',{name:'Pause',exact:true}).click(); await page.reload()
  await page.getByRole('button',{name:'Resume block',exact:true}).click()
  await expect(page.getByRole('textbox').first()).toHaveValue('alpha')
  await page.getByRole('button',{name:'Submit answer',exact:true}).click()
  await expect(page.getByLabel('Explanation',{exact:true})).toBeVisible()
  const formats = await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).myqbankBlocks).flatMap((b:any)=>b.entries.map((e:any)=>e.concept.interaccion.recomendada)))
  expect(new Set(formats).size).toBe(10)
  await page.getByText('Question map',{exact:true}).click()
  for (let i=2;i<=10;i++) {
    await page.getByRole('button',{name:new RegExp(`^Question ${i},`)}).click()
    await expect(page.getByRole('heading',{name:`Question ${i}`,exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Submit answer',exact:true})).toBeVisible()
  }
})
test('highlight survives reload and removal; mobile and desktop stay inside the viewport', async ({page}) => {
  await network(page); await page.goto(url)
  await page.getByRole('button',{name:'Start 5-question block'}).click()
  const stem = page.locator('.mq-stem .mq-highlight-text').first()
  await expect(stem).toBeVisible()
  await stem.evaluate(el=>{ const range=document.createRange(); range.selectNodeContents(el); const selection=window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true})) })
  await page.getByRole('button',{name:'Highlight selection',exact:true}).click()
  await expect(stem.locator('mark')).toHaveCount(1)
  await page.getByRole('button',{name:'Pause',exact:true}).click(); await page.reload()
  await page.getByRole('button',{name:'Resume block',exact:true}).click()
  await expect(page.locator('.mq-stem mark')).toHaveCount(1)
  await page.locator('.mq-stem mark').click()
  await page.getByRole('button',{name:'Remove highlight',exact:true}).click()
  await expect(page.locator('.mq-stem mark')).toHaveCount(0)
  for (const width of [390,1280]) {
    await page.setViewportSize({width,height:844})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.getByRole('button',{name:'Labs',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Lab reference',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'Labs',exact:true}).click()
  }
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Labs',exact:true}).click()
  await page.getByText('Synthetic saved option C',{exact:true}).click()
  await page.getByRole('button',{name:'Submit answer',exact:true}).click()
  await expect(page.locator('.mq-result')).toBeFocused()
  const explanation=await page.getByRole('complementary',{name:'Explanation',exact:true}).boundingBox()
  const labs=await page.getByLabel('Lab reference',{exact:true}).boundingBox()
  expect(explanation!.y).toBeLessThan(844)
  expect(labs!.y).toBeGreaterThan(explanation!.y)
})
test('all ten concept interactions submit once and hide grading throughout Test', async ({page}) => {
  await network(page); await page.goto(url)
  await page.getByRole('button',{name:'Mehlman Concepts',exact:true}).click()
  await page.getByRole('button',{name:'Test',exact:true}).click()
  await page.getByRole('button',{name:'10',exact:true}).click()
  await page.getByRole('button',{name:'Start 10-question block'}).click()
  await page.getByText('Question map',{exact:true}).click()
  const formats:string[]=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).myqbankBlocks).flatMap((b:any)=>b.entries.map((e:any)=>e.concept.interaccion.recomendada)))
  for(let i=0;i<formats.length;i++) {
    await page.getByRole('button',{name:new RegExp(`^Question ${i+1},`)}).click()
    const interaction=page.locator('.mq-concept-interaction')
    switch(formats[i]) {
      case 'recuperacion_libre':case 'completar':await interaction.getByRole('textbox').fill('alpha');break
      case 'opcion_multiple':case 'caso_clinico':case 'verdadero_falso':await interaction.getByRole('radio').filter({hasText:'alpha'}).click();break
      case 'numerico':await interaction.getByRole('textbox').fill('4');break
      case 'prediccion_direccional':await interaction.getByRole('radio',{name:'Alpha increases',exact:true}).click();await interaction.getByRole('radio',{name:'Beta decreases',exact:true}).click();break
      case 'secuencia':for(const name of ['Alpha','Beta','Gamma'])await interaction.getByRole('button',{name,exact:true}).click();break
      case 'relacionar':for(const name of ['Alpha','One','Beta','Two'])await interaction.getByRole('button',{name,exact:true}).click();break
      case 'clasificar':await interaction.getByRole('button',{name:'Alpha',exact:true}).click();await interaction.locator('.zona[role=button]').nth(0).click();await interaction.getByRole('button',{name:'Beta',exact:true}).click();await interaction.locator('.zona[role=button]').nth(1).click();break
    }
    await interaction.getByRole('button',{name:'Submit answer',exact:true}).click()
    await expect(page.getByText('Answer saved',{exact:true})).toBeVisible()
    await expect(page.getByLabel('Explanation',{exact:true})).toHaveCount(0)
    await expect(interaction.locator('.acierto,.fallo,.correcta-oculta,.ok,.mal')).toHaveCount(0)
  }
  await page.getByRole('button',{name:'End block',exact:true}).click()
  await page.getByRole('button',{name:'End and review',exact:true}).click()
  await expect(page.getByText('10 / 10 graded correct · 0 unanswered · 0 pending',{exact:true})).toBeVisible()
  const attempts=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).progreso).flatMap((p:any)=>p.intentos))
  expect(attempts).toHaveLength(10)
})
test('Mixed keeps its exact order and both histories when pausing and resuming', async ({page}) => {
  await network(page); await page.goto(url)
  await page.getByRole('button',{name:'Mixed',exact:true}).click()
  await page.getByRole('button',{name:'Start 5-question block'}).click()
  await expect(page.getByRole('heading',{name:'Question 1',exact:true})).toBeVisible()
  const entries:{kind:string;id:string}[]=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).myqbankBlocks).flatMap((b:any)=>b.entries))
  expect(entries).toHaveLength(5)
  expect(new Set(entries.map(e=>e.kind)).size).toBe(2)
  expect(new Set(entries.map(e=>e.id)).size).toBe(5)
  await page.getByRole('textbox').first().fill('alpha')
  await page.getByRole('button',{name:'Submit answer',exact:true}).click()
  await page.getByText('Question map',{exact:true}).click()
  const position=entries.findIndex(e=>e.kind==='nbme')+1
  await page.getByRole('button',{name:new RegExp(`^Question ${position},`)}).click()
  await page.getByText('Synthetic saved option C',{exact:true}).click()
  await page.getByRole('button',{name:'Submit answer',exact:true}).click()
  await expect(page.getByText('Correct answer',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Pause',exact:true}).click(); await page.reload()
  await page.getByRole('button',{name:'Resume block',exact:true}).click()
  await expect(page.getByRole('heading',{name:`Question ${position}`,exact:true})).toBeVisible()
  await expect(page.getByText('Correct answer',{exact:true})).toBeVisible()
  const saved=await page.evaluate(()=>({entries:Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).myqbankBlocks).flatMap((b:any)=>b.entries),attempts:Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).progreso).flatMap((p:any)=>p.intentos)}))
  expect(saved.entries.map((e:any)=>({kind:e.kind,id:e.id}))).toEqual(entries.map(e=>({kind:e.kind,id:e.id})))
  expect(saved.attempts).toHaveLength(1)
})
test('earlier daily concept sessions retain their queue and get adaptive feedback', async ({page}) => {
  await network(page); await page.goto(`${url}&retomar=conceptos`)
  await page.getByRole('button',{name:'Resume earlier session',exact:true}).click()
  await expect(page.getByText('Registrar confianza (opcional)',{exact:true})).toHaveCount(0)
  await page.getByRole('textbox').first().fill('respuesta sintética')
  await page.getByRole('button',{name:'Submit answer',exact:true}).click()
  await expect(page.getByText('Spanish adaptation pending · existing explanation available',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-myqbank-state')!).reanudable.conceptIds)).toEqual(['C8','C4','C8'])
})
test('a required figure blocks submission until loaded and opens the original zoom viewer', async ({page}) => {
  await network(page,true)
  let available=false
  await page.route('**/api/nbme/assets/QA-figure',route=>available
    ? route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=','base64')})
    : route.fulfill({status:503,json:{error:'Synthetic figure offline'}}))
  await page.goto(url)
  await page.getByRole('button',{name:'Start 5-question block'}).click()
  await page.getByText('Synthetic saved option C',{exact:true}).click()
  await expect(page.getByRole('button',{name:'Submit answer',exact:true})).toBeDisabled()
  await expect(page.getByRole('button',{name:'Retry figure',exact:true})).toBeVisible()
  available=true
  await page.getByRole('button',{name:'Retry figure',exact:true}).click()
  await expect(page.getByRole('button',{name:'Submit answer',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'Expand figure: Synthetic square',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'Submit answer',exact:true}).click()
  await expect(page.getByText('Correct answer',{exact:true})).toBeVisible()
})
