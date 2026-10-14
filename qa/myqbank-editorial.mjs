import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Administrative, offline preparation only. Never connects to Supabase or approves content.
const repo = await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
const insideRepo = dir => dir === repo || dir.startsWith(repo + path.sep)
const sourceDir = process.argv[2] && await fs.realpath(process.argv[2])
const outputDir = process.argv[3] && path.resolve(process.argv[3])
if (!sourceDir || !outputDir || insideRepo(sourceDir) || insideRepo(outputDir)) {
  throw Error('Usage: node qa/myqbank-editorial.mjs PRIVATE_SOURCE_DIR PRIVATE_OUTPUT_DIR (both outside Git).')
}
await fs.mkdir(outputDir, {recursive:true,mode:0o700})
if (insideRepo(await fs.realpath(outputDir))) throw Error('Private output must stay outside Git.')
const read = async file => {
  const resolved = await fs.realpath(path.resolve(sourceDir,file))
  if (!resolved.startsWith(sourceDir + path.sep)) throw Error('Source path escapes the private directory.')
  return JSON.parse(await fs.readFile(resolved,'utf8'))
}
const save = async (file,data) => fs.writeFile(path.join(outputDir,file),JSON.stringify(data,null,2),{mode:0o600})
const vite = await createServer({root:repo,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}})
try {
  const { validarIndicePublicado, validarModuloPublicado } = await vite.ssrLoadModule('/src/data/integridad.ts')
  const { sourceIdentity, editorialPath } = await vite.ssrLoadModule('/src/myqbank/editorial.ts')
  const { aplicarVariante } = await vite.ssrLoadModule('/src/lib/variantes.ts')
  const { prepararConcepto } = await vite.ssrLoadModule('/src/lib/formatos.ts')
  const { buildConceptCatalog } = await vite.ssrLoadModule('/src/myqbank/catalog.ts')
  const { parseNbmeQuestion, parseNbmeCatalog } = await vite.ssrLoadModule('/src/nbme/api.ts')
  const index = validarIndicePublicado(await read('index.json'))
  const manifest = await read('sources-manifest.json'), nbmeManifest = await read('nbme-manifest.json')
  const concepts = [], rows = [], seen = new Set(), blocked = []
  async function add(source, sourcePath, sourceMd5, context) {
    const identity = await sourceIdentity(source), target = editorialPath(identity)
    const key = `${identity.kind}:${target}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({source:identity,sourcePath,sourceMd5,proposedPath:target,context,
      format:source.interaccion?.recomendada ?? 'nbme',system:source.clasificacion?.sistema_primario ?? source.systems,
      state:'not_drafted',applicability:'pending_review',independentReview:null})
  }
  for (const module of index.modulos) {
    const sourcePath=`modules/${module.module_id}.json`, snapshot=manifest.find(x=>x.path===sourcePath)
    if (!snapshot) throw Error('Missing source snapshot.')
    const loaded=validarModuloPublicado(await read(sourcePath),module,index.corpus_version)
    concepts.push(...loaded)
    for (const concept of loaded) {
      await add(concept,sourcePath,snapshot.md5,{kind:'base'})
      for (const variant of concept.variantes ?? []) await add(aplicarVariante(concept,variant.variant_id),sourcePath,snapshot.md5,{kind:'variant',variantId:variant.variant_id})
      // Covers the current version's parity-dependent formats, recognition and term practice.
      // Historical v1 presentations keep their existing explanation until reviewed separately.
      for (const semilla of ['a','b']) for (const indice of [0,1]) for (const ruta of ['repaso','examen','terminos']) for (const forzarReconocimiento of [false,true]) {
        const context={semilla,indice,ruta,forzarReconocimiento,version:3}
        await add(prepararConcepto(concept,context),sourcePath,snapshot.md5,{kind:'prepared',...context})
      }
    }
  }
  const catalog=parseNbmeCatalog(await read('catalog-index.json'))
  if (!catalog || catalog.total !== nbmeManifest.length) throw Error('Incomplete NBME snapshot.')
  for (const meta of catalog.questions) {
    const record=await read(`questions/${meta.id}.json`)
    if (record.payload.revision!==meta.revision || record.path!==`questions/${meta.id}/${meta.revision}.json`
      || !nbmeManifest.some(x=>x.path===record.path&&x.md5===record.md5)) throw Error('NBME snapshot mismatch.')
    if (meta.status==='blocked') {blocked.push({id:meta.id,revision:meta.revision,reasons:meta.reasons});continue}
    const parsed=parseNbmeQuestion(record.payload)
    if (!parsed) throw Error(`Enabled NBME question fails validation: ${meta.id}`)
    await add(parsed,record.path,record.md5,{kind:'nbme'})
  }
  const summary={corpusVersion:index.corpus_version,bankVersion:catalog.bankVersion,
    concepts:concepts.length,variants:concepts.reduce((n,c)=>n+(c.variantes?.length??0),0),nbmeReady:catalog.total-blocked.length,
    nbmeBlocked:blocked.length,presentations:rows.length,independentlyReviewed:0,
    note:'Inventory preparation is not clinical approval. Draft/review/publication states must be reconciled per exact source and content hash.'}
  await save('inventory.json',{schemaVersion:1,summary,items:rows,blocked})
  await save('concept-catalog.json',buildConceptCatalog(index,concepts))
  await save('coverage-summary.json',summary)
  console.log(JSON.stringify(summary))
} finally { await vite.close() }
