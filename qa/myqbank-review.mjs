import { chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
const evidence=process.env.MYQBANK_EVIDENCE_DIR || 'docs/myqbank-phases-2-4'
const phase=process.env.MYQBANK_EVIDENCE_PHASE || 'after'
if(!['before','after'].includes(phase))throw Error('MYQBANK_EVIDENCE_PHASE must be before or after')
const out=`${evidence}/${phase}`
const observations=[]
let currentScreenshots=0
// Wait for real font loading and inspect every captured screen, not only the final answer.
async function capture(page, name, errors=[]) {
  await page.evaluate(() => document.fonts.ready)
  const layout = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })),
    bodyFont: getComputedStyle(document.querySelector('.mq-root') ?? document.body).fontFamily,
    headingFont: getComputedStyle(document.querySelector('.mq-root h1, .mq-root h2') ?? document.body).fontFamily,
  }))
  if (layout.horizontalOverflow) throw Error(`Horizontal overflow: ${name}`)
  if (errors.length) throw Error(`${name}: ${errors.join('\n')}`)
  observations.push({ screen: name, ...layout })
  await page.screenshot({path:`${out}/${name}.png`,fullPage:true,animations:'disabled'})
  currentScreenshots++
}
await mkdir(out,{recursive:true})
await mkdir(`${evidence}/before`,{recursive:true})
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','e2e/arnes/vite.config.ts','--host','127.0.0.1','--port','5205'],{stdio:'pipe'})
let serverLog=''
server.stdout.on('data',data=>{serverLog+=data})
server.stderr.on('data',data=>{serverLog+=data})
const base='http://127.0.0.1:5205'
let ready=false
for(let i=0;i<200;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,100))}
if(!ready){server.kill('SIGTERM');throw Error(`Visual fixture server unavailable: ${serverLog}`)}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined})
// A populated synthetic catalog exposes real dashboard density without private content.
const systems=['Cardiovascular','Endocrino','Gastrointestinal','Hematológico y oncológico','Multisistémico','Musculoesquelético','Neurológico','Renal','Reproductivo','Respiratorio']
const q=(id,revision='qa1')=>({id,revision,form:'27',section:1,item:1,page:1,systems:[systems[Number(id.split('-').at(-1))%systems.length]],disciplines:['Physiology'],topic:'Synthetic fixture',objective:null,status:'ready',reasons:[],figureRequired:false,conceptLinks:[],
  stem:'Synthetic demonstration question. The first sample contains 12 units and the second sample contains 30 units.\n\nSample | Value\nFirst | 12 units\nSecond | 30 units\n\nWhich option matches the demonstration?',options:[{id:'A',text:'The first sample is larger.'},{id:'B',text:'The second sample is larger.'},{id:'C',text:'Both samples are identical.'}],answer:'B',explanation:'The second sample contains 30 units, while the first contains 12 units. Therefore, option B follows from the values provided in this synthetic question. This example verifies the interface only and contains no clinical claims.',figures:[],provenance:{sourceFile:'synthetic QA',sourceRecordId:id,notes:[]}})
try {
  for(const width of [390,1280])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:900},locale:'en',timezoneId:'America/New_York'})
    const page=await context.newPage(),errors=[]
    page.setDefaultTimeout(10000)
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/api/**',r=>{
      const path=new URL(r.request().url()).pathname
      if(path.endsWith('/catalog'))return r.fulfill({json:{schemaVersion:1,bankVersion:'qa',total:85,questions:Array.from({length:85},(_,i)=>q(`QA-${i}`))}})
      if(path.endsWith('/questions'))return r.fulfill({json:{questions:r.request().postDataJSON().refs.map(ref=>q(ref.id,ref.revision))}})
      if(path==='/api/ia/chat')return r.fulfill({json:{respuesta:'La segunda muestra contiene 30 unidades y la primera contiene 12. Esta respuesta es sintética y permite revisar la presentación del tutor sin consultar ningún modelo.',cached:false}})
      return r.fulfill({status:503,json:{error:'Synthetic QA backend'}})
    })
    await page.goto(`${base}/?workspace=myqbank&proveedor=nbme-real&escena=abierto&ia=1`)
    await expect(page.getByRole('button',{name:'Start 5-question block'})).toBeEnabled()
    // Match the production entry/chunk cascade, as e2e/arnes/orden-produccion.ts does.
    await page.evaluate(() => {
      const layout=[...document.querySelectorAll('style[data-vite-dev-id]')]
        .find(style=>(style.getAttribute('data-vite-dev-id') ?? '').endsWith('/myqbank/layout.css'))
      if(!layout)throw Error('layout.css is required to review the production cascade')
      document.head.appendChild(layout)
    })
    const root=page.locator('.mq-workspace')
    if(await root.getAttribute('data-theme')!==theme)await page.getByRole('button',{name:/Switch to .* theme/}).click()
    await capture(page, `dashboard-${width}-${theme}`, errors)
    await page.getByRole('button',{name:'Open chat',exact:true}).click()
    const sessionDialog=page.getByRole('dialog',{name:'Pídele a Claude una sesión',exact:true})
    await expect(sessionDialog.getByLabel('Lo que quieres estudiar',{exact:true})).toBeFocused()
    await capture(page, `claude-session-${width}-${theme}`, errors)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button',{name:'Continue chat',exact:true})).toBeFocused()
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    await page.getByRole('heading',{name:'Settings',exact:true}).waitFor()
    await capture(page, `settings-${width}-${theme}`, errors)
    await page.getByRole('button',{name:'Dashboard',exact:true}).click()
    await page.getByRole('button',{name:'Start 5-question block'}).click()
    await page.getByRole('heading',{name:'Question 1',exact:true}).waitFor()
    await page.getByRole('button',{name:'Labs',exact:true}).click()
    await capture(page, `study-before-${width}-${theme}`, errors)
    await page.getByText('The second sample is larger.',{exact:true}).click()
    await page.getByRole('button',{name:'Submit answer',exact:true}).click()
    await page.getByText('Correct answer',{exact:true}).waitFor()
    await capture(page, `study-after-${width}-${theme}`, errors)
    const tutor=page.getByRole('region',{name:'Claude, tu tutor de esta pregunta',exact:true})
    await tutor.getByRole('button',{name:'Mecanismo paso a paso',exact:true}).click()
    await expect(tutor).toContainText('Esta respuesta es sintética')
    await capture(page, `study-tutor-${width}-${theme}`, errors)
    await page.getByRole('button',{name:'End block',exact:true}).click()
    const endDialog=page.getByRole('dialog',{name:'End this block?',exact:true})
    await expect(endDialog).toBeVisible()
    await capture(page, `end-block-${width}-${theme}`, errors)
    await endDialog.getByRole('button',{name:'Keep studying',exact:true}).click()
    await context.close()
    const login=await browser.newContext({viewport:{width,height:900},locale:'en'})
    const auth=await login.newPage()
    auth.setDefaultTimeout(10000)
    const authErrors=[]
    auth.on('pageerror',error=>authErrors.push(error.message))
    if(theme==='light'){
      await auth.goto(`${base}/?escena=abierto#ajustes`)
      await auth.getByRole('heading',{name:'Ajustes',exact:true}).waitFor()
      await auth.screenshot({path:`${evidence}/before/settings-${width}.png`,fullPage:true,animations:'disabled'})
      await auth.goto(`${base}/?auth-scene=1`)
      await auth.getByRole('heading',{name:'Vuelve a tu estudio'}).waitFor()
      await auth.screenshot({path:`${evidence}/before/auth-${width}.png`,fullPage:true,animations:'disabled'})
    }
    await auth.goto(`${base}/?auth-scene=1&workspace=myqbank`)
    await auth.getByRole('heading',{name:'Welcome back'}).waitFor()
    if(await auth.locator('.mq-auth').getAttribute('data-theme')!==theme)await auth.getByRole('button',{name:'Change theme',exact:true}).click()
    await capture(auth, `auth-${width}-${theme}`, authErrors)
    await auth.getByRole('button',{name:'Forgot password?',exact:true}).click()
    await auth.getByRole('heading',{name:'Reset your password'}).waitFor()
    await capture(auth, `recovery-${width}-${theme}`, authErrors)
    await login.close()
  }
  await writeFile(`${out}/observations.json`,JSON.stringify(observations,null,2))
  console.log(`${currentScreenshots} current screenshots + 4 auth/settings baselines; 390/1280, light/dark, fonts settled, no page errors or horizontal overflow on any captured screen.`)
}finally{await browser.close();server.kill('SIGTERM')}
