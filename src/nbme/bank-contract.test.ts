// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseNbmeCatalog, parseNbmeQuestion } from './api'

const directory = process.env.STEP1_NBME_BANK_DIR
it.skipIf(!directory)('validates the private import against the exact frontend contract', () => {
  const catalog = parseNbmeCatalog(JSON.parse(readFileSync(join(directory!, 'catalog.json'), 'utf8')))
  expect(catalog).not.toBeNull()
  expect(catalog!.total).toBe(596)
  let ready = 0
  for (const meta of catalog!.questions) {
    const raw = JSON.parse(readFileSync(join(directory!, 'questions', meta.id, `${meta.revision}.json`), 'utf8'))
    const question = parseNbmeQuestion(raw)
    if (meta.status === 'ready') {
      ready++
      expect(question, meta.id).not.toBeNull()
      expect(question!.answer).toBe(raw.answer)
      expect(question!.options).toEqual(raw.options)
    } else expect(question, meta.id).toBeNull()
  }
  expect(ready).toBeGreaterThan(0)
})
