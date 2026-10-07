import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const REPO=process.env.APLICACION_CAPTURE_REPO??fileURLToPath(new URL('../..',import.meta.url))
const {chromium,expect}=await import(pathToFileURL(path.join(REPO,'node_modules/@playwright/test/index.mjs')).href)
const BASE=process.env.APLICACION_CAPTURE_URL??'http://127.0.0.1:5320'
const BUILD=process.env.APLICACION_CAPTURE_BUILD
if(!BUILD)throw Error('Indica APLICACION_CAPTURE_BUILD, el directorio compilado anterior')
const OUT=process.env.APLICACION_CAPTURE_OUT??path.join(REPO,'docs/aplicacion-dominio/antes')
const PREGUNTA='In the demonstration protocol, which complete rule governs the blue token?'
const html=await(await fetch(BASE)).text()
if(html.includes('/@vite/client')||!html.match(/\/assets\/[^"\s]+\.js/))throw Error('Exige compilado')
if(await readFile(path.join(BUILD,'index.html'),'utf8')!==html)throw Error('Build incorrecto')
await mkdir(OUT,{recursive:true})
const browser=await chromium.launch({executablePath:'/usr/bin/chromium'})
const evidencia={fuente:'84d875998bcf29a3a01946ac4237152725d545fd',escena:'aplicacion',contenido:'Reglas inventadas de fichas y compuertas. Sin material clínico.',bundle:html.match(/\/assets\/[^"\s]+\.js/)[0],capturas:[]}
try{
for(const width of[390,1280]){
const context=await browser.newContext({viewport:{width,height:844},locale:'es-ES',timezoneId:'America/New_York',reducedMotion:'reduce'})
const page=await context.newPage(),errores=[]
page.on('pageerror',e=>errores.push(String(e)))
await page.clock.install({time:new Date('2026-10-05T11:30:00Z')})
await page.route('**/*',route=>{const u=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Synthetic backend unavailable.'}});return route.continue()})
const capture=async nombre=>{
await expect(page.locator('.pregunta')).toHaveText(PREGUNTA)
await expect(page.locator('.synapse-heading[data-animating="true"]')).toHaveCount(0)
await page.mouse.move(0,0)
await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();scrollTo(0,0)})
expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
expect(errores).toEqual([])
const archivo=`${nombre}-${width}.png`
await page.screenshot({path:path.join(OUT,archivo),fullPage:true})
evidencia.capturas.push({archivo,width,pregunta:await page.locator('.pregunta').innerText()})
}
await page.goto(`${BASE}/?escena=aplicacion#hoy`)
const antes=await page.evaluate(()=>window.__leerProgresoSintetico().progreso)
await page.getByRole('button',{name:'Empezar las cajas',exact:true}).click()
expect(await page.evaluate(()=>window.__leerProgresoSintetico().progreso)).toEqual(antes)
await capture('cajas-base')
await page.goto(`${BASE}/?escena=aplicacion&retomar=base-guardada#hoy`)
const previa=await page.evaluate(()=>window.__leerProgresoSintetico())
await page.getByRole('region',{name:'Tu sesión guardada',exact:true}).getByRole('button',{name:'Retomar mi sesión pendiente',exact:true}).click()
await expect(page.locator('.avance')).toHaveAttribute('aria-label','Pregunta 2 de 2')
expect(await page.evaluate(()=>window.__leerProgresoSintetico().progreso)).toEqual(previa.progreso)
await capture('retoma-base')
await context.close()
}
await writeFile(path.join(OUT,'evidencia.json'),JSON.stringify(evidencia,null,2)+'\n')
console.log(JSON.stringify({ok:true,capturas:evidencia.capturas.length,carpeta:OUT,bundle:evidencia.bundle}))
}finally{await browser.close()}
