import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
const evidence=process.env.MYQBANK_EVIDENCE_DIR || 'docs/myqbank-phases-2-4'
const out=`${evidence}/after`
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
const q=(id,revision='qa1')=>({id,revision,form:'27',section:1,item:1,page:1,systems:['Renal','Cardiovascular'],disciplines:['Physiology'],topic:'Synthetic fixture',objective:null,status:'ready',reasons:[],figureRequired:false,conceptLinks:[],
  stem:'Synthetic demonstration question. The first sample contains 12 units and the second sample contains 30 units.\n\nSample | Value\nFirst | 12 units\nSecond | 30 units\n\nWhich option matches the demonstration?',options:[{id:'A',text:'The first sample is larger.'},{id:'B',text:'The second sample is larger.'},{id:'C',text:'Both samples are identical.'}],answer:'B',explanation:'The second sample contains 30 units, while the first contains 12 units. Therefore, option B follows from the values provided in this synthetic question. This example verifies the interface only and contains no clinical claims.',figures:[],provenance:{sourceFile:'synthetic QA',sourceRecordId:id,notes:[]}})
try {
  for(const width of [390,1280])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:900},locale:'en',timezoneId:'America/New_York'})
    const page=await context.newPage(),errors=[]
    page.setDefaultTimeout(10000)
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/api/**',r=>{
      const path=new URL(r.request().url()).pathname
      if(path.endsWith('/catalog'))return r.fulfill({json:{schemaVersion:1,bankVersion:'qa',total:15,questions:Array.from({length:15},(_,i)=>q(`QA-${i}`))}})
      if(path.endsWith('/questions'))return r.fulfill({json:{questions:r.request().postDataJSON().refs.map(ref=>q(ref.id,ref.revision))}})
      return r.fulfill({status:503,json:{error:'Synthetic QA backend'}})
    })
    await page.goto(`${base}/?workspace=myqbank&proveedor=nbme-real&escena=abierto`)
    await page.getByRole('button',{name:'Start 5-question block'}).waitFor({state:'visible'})
    const root=page.locator('.mq-workspace')
    if(await root.getAttribute('data-theme')!==theme)await page.getByRole('button',{name:/Switch to .* theme/}).click()
    await page.screenshot({path:`${out}/dashboard-${width}-${theme}.png`,fullPage:true})
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    await page.getByRole('heading',{name:'Settings',exact:true}).waitFor()
    await page.screenshot({path:`${out}/settings-${width}-${theme}.png`,fullPage:true})
    await page.getByRole('button',{name:'Dashboard',exact:true}).click()
    await page.getByRole('button',{name:'Start 5-question block'}).click()
    await page.getByRole('heading',{name:'Question 1',exact:true}).waitFor()
    await page.getByRole('button',{name:'Labs',exact:true}).click()
    await page.screenshot({path:`${out}/study-before-${width}-${theme}.png`,fullPage:true})
    await page.getByText('The second sample is larger.',{exact:true}).click()
    await page.getByRole('button',{name:'Submit answer',exact:true}).click()
    await page.getByText('Correct answer',{exact:true}).waitFor()
    await page.screenshot({path:`${out}/study-after-${width}-${theme}.png`,fullPage:true})
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow')
    if(errors.length)throw Error(errors.join('\n'))
    await context.close()
    const login=await browser.newContext({viewport:{width,height:900},locale:'en'})
    const auth=await login.newPage()
    auth.setDefaultTimeout(10000)
    if(theme==='light'){
      await auth.goto(`${base}/?escena=abierto#ajustes`)
      await auth.getByRole('heading',{name:'Ajustes',exact:true}).waitFor()
      await auth.screenshot({path:`${evidence}/before/settings-${width}.png`,fullPage:true})
      await auth.goto(`${base}/?auth-scene=1`)
      await auth.getByRole('heading',{name:'Vuelve a tu estudio'}).waitFor()
      await auth.screenshot({path:`${evidence}/before/auth-${width}.png`,fullPage:true})
    }
    await auth.goto(`${base}/?auth-scene=1&workspace=myqbank`)
    await auth.getByRole('heading',{name:'Welcome back'}).waitFor()
    if(await auth.locator('.mq-auth').getAttribute('data-theme')!==theme)await auth.getByRole('button',{name:'Change theme',exact:true}).click()
    await auth.screenshot({path:`${out}/auth-${width}-${theme}.png`,fullPage:true})
    await auth.getByRole('button',{name:'Forgot password?',exact:true}).click()
    await auth.getByRole('heading',{name:'Reset your password'}).waitFor()
    await auth.screenshot({path:`${out}/recovery-${width}-${theme}.png`,fullPage:true})
    if(await auth.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Auth horizontal overflow')
    await login.close()
  }
  console.log('24 current screenshots + 4 auth/settings baselines; 390/1280, light/dark, no page errors or horizontal overflow.')
}finally{await browser.close();server.kill('SIGTERM')}
