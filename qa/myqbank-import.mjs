import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'

// Offline, private draft intake. No Supabase connection, approval or publication.
const repo = await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
const [assignmentArg, deliveryArg, outputArg] = process.argv.slice(2)
if (!assignmentArg || !deliveryArg || !outputArg) throw Error('Usage: node qa/myqbank-import.mjs ASSIGNMENT_DIR DELIVERY_DIR PRIVATE_OUTPUT_DIR')
const outside = p => { if (p === repo || p.startsWith(repo + path.sep)) throw Error('Private files must stay outside Git.') }
const assignmentDir = await fs.realpath(assignmentArg), deliveryDir = await fs.realpath(deliveryArg), outputDir = path.resolve(outputArg)
outside(assignmentDir); outside(deliveryDir); outside(outputDir)
await fs.mkdir(outputDir, { recursive: true, mode: 0o700 }); outside(await fs.realpath(outputDir))
if ([assignmentDir, deliveryDir].includes(await fs.realpath(outputDir))) throw Error('Use a separate output directory.')
if ((await fs.readdir(outputDir)).length) throw Error('Use an empty private output directory; previous receipts are preserved.')
const read = async (root, name) => {
  const resolved = await fs.realpath(path.resolve(root, name))
  if (!resolved.startsWith(root + path.sep)) throw Error('Input path escapes the private directory.')
  return fs.readFile(resolved, 'utf8')
}
const master = JSON.parse(await read(assignmentDir, 'assignment.json'))
const vite = await createServer({ root: repo, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { validateEditorialDelivery } = await vite.ssrLoadModule('/src/myqbank/intake.ts')
  const reports = [], seen = new Set(), outputs = []
  for (const filename of (await fs.readdir(deliveryDir)).filter(f => f.endsWith('.json')).sort()) {
    const raw = await read(deliveryDir, filename), delivery = JSON.parse(raw)
    // Manifests, glossary and source proposals are retained separately, never mistaken for drafts.
    if (!delivery.batchId || !Array.isArray(delivery.items)) continue
    if (delivery.assignmentId !== master.assignmentId || !master.batches.some(b => b.batchId === delivery.batchId)
      || !/^[a-zA-Z0-9_-]+$/.test(delivery.batchId) || seen.has(delivery.batchId)) throw Error('Unknown, duplicated or mismatched batch.')
    seen.add(delivery.batchId)
    const assignment = JSON.parse(await read(assignmentDir, `batches/${delivery.batchId}.json`))
    const result = await validateEditorialDelivery(assignment, delivery)
    reports.push({ batchId: delivery.batchId, filename, fileSha256: createHash('sha256').update(raw).digest('hex'), ...result.counts })
    outputs.push([`${delivery.batchId}.review-queue.json`, result])
  }
  if (!reports.length) throw Error('No batch deliveries found.')
  // Validate every input first: a rejected batch must not leave a partly accepted delivery.
  for (const [filename, data] of [...outputs, ['intake-report.json', { assignmentId: master.assignmentId, approvalGranted: false, reports,
    pendingBatches: master.batches.filter(b => !seen.has(b.batchId)).map(b => b.batchId) }]]) {
    await fs.writeFile(path.join(outputDir, filename), JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  }
  console.log(JSON.stringify({ batches: reports.length, tasks: reports.reduce((n, b) => n + b.total, 0), approvalGranted: false }))
} finally { await vite.close() }
