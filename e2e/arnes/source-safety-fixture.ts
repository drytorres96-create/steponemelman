import type { Page } from '@playwright/test'
import { NBME_SOURCE_SAFETY_PATH, type NbmeSourceSafety } from '../../src/nbme/source-safety'

/** Explicit permission for synthetic legacy-recovery scenarios. The shared harness
 * still has no policy by default, so missing-policy tests continue to fail closed. */
export async function installOriginalRecoveryPolicy(page: Page) {
  const policy: NbmeSourceSafety = { schemaVersion: 1, version: 'synthetic-recovery-1', review: 'approved', rules: [] }
  await page.addInitScript(({ path, policy }) => {
    window.__qaEditorialAssets = { ...window.__qaEditorialAssets, [path]: policy }
  }, { path: NBME_SOURCE_SAFETY_PATH, policy })
}
