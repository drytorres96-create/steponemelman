import { expect, it } from 'vitest'
import { itemSystems, systemKey, systemLabel } from './taxonomy'
import { SISTEMAS } from '../schema/concept'

it('keeps a stable source key for every translated system label', () => {
  for (const key of SISTEMAS) expect(systemKey(systemLabel(key))).toBe(key)
  expect(systemLabel('Endocrino')).toBe('Endocrine')
  expect(systemLabel('Hematológico y oncológico')).toBe('Hematology & oncology')
})

it('coalesces known translations, accents and whitespace without inferring unknown classifications', () => {
  expect(itemSystems([' endocrino ', 'Endocrine', 'NEUROLOGICO', 'Neurológico', ' ']))
    .toEqual(['Endocrino', 'Neurológico'])
  expect(itemSystems(['Novel category', 'Multisistémico'])).toEqual(['Novel category', 'Multisistémico'])
  expect(itemSystems([' ', ''])).toEqual(['Unclassified'])
})
