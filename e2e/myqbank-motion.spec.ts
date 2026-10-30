import { expect, test, type Locator, type Page } from '@playwright/test'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
import { ordenDeProduccion } from './arnes/orden-produccion'

type Note = { waveform: string; frequency: { kind: string; value: number; offset: number }[] }
declare global {
  interface Window {
    __motionAudio: { contexts: number; notes: Note[] }
    __motionTransforms: string[]
    __earlyFeedback: boolean
    __feedbackObserver: MutationObserver
  }
}

// A silent WebAudio double records scheduled notes. No real audio, backend or AI is used.
async function installAudioProbe(page: Page) {
  await page.addInitScript(() => {
    window.__motionAudio = { contexts: 0, notes: [] }
    class Parameter {
      value = 0
      events: { kind: string; value: number; time: number }[] = []
      setValueAtTime(value: number, time: number) { this.events.push({ kind: 'set', value, time }) }
      exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ kind: 'ramp', value, time }) }
      cancelScheduledValues() {}
      setTargetAtTime() {}
    }
    class AudioNode {
      connect() {}
      disconnect() {}
    }
    class Context {
      state = 'running'
      destination = new AudioNode()
      get currentTime() { return performance.now() / 1000 }
      constructor() { window.__motionAudio.contexts++ }
      createGain() { return Object.assign(new AudioNode(), { gain: new Parameter() }) }
      createBiquadFilter() { return Object.assign(new AudioNode(), { type: '', frequency: new Parameter(), Q: new Parameter() }) }
      createOscillator() {
        return Object.assign(new AudioNode(), {
          type: '', frequency: new Parameter(), onended: null,
          start(time: number) {
            window.__motionAudio.notes.push({ waveform: this.type, frequency: this.frequency.events.map(event => ({
              kind: event.kind, value: event.value, offset: Math.round((event.time - time) * 10000) / 10000,
            })) })
          },
          stop() {},
        })
      }
      async resume() { this.state = 'running' }
      async close() { this.state = 'closed' }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: Context })
  })
}

async function workspace(page: Page) {
  const questions = Array.from({ length: 12 }, (_, i) => ({ ...preguntaNbmeReal(`MOTION-${i}`), systems: ['Renal'] }))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/nbme/catalog') return route.fulfill({ json: { schemaVersion: 1, bankVersion: 'motion-fixture', total: questions.length, questions } })
    if (path === '/api/nbme/questions') {
      const refs = route.request().postDataJSON().refs as { id: string; revision: string }[]
      return route.fulfill({ json: { questions: refs.map(ref => ({ ...preguntaNbmeReal(ref.id, ref.revision), systems: ['Renal'] })) } })
    }
    return route.fulfill({ status: 503, json: { disponible: false } })
  })
  await page.goto('/?workspace=myqbank&proveedor=nbme-real&escena=abierto')
  await expect(page.getByRole('button', { name: 'Start 5-question block', exact: true })).toBeEnabled()
  await ordenDeProduccion(page)
}

const soundToggle = (scope: Page | Locator) => scope.getByRole('button', { name: /^(Enable|Mute) soft sounds$/ })
const headerSound = (page: Page) => soundToggle(page.locator('.mq-header'))
const nextFrame = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

test('soft sounds require opt-in, persist both choices and never autoplay on reload or hover', async ({ page }) => {
  await installAudioProbe(page)
  await workspace(page)
  await expect(page.locator('.mq-workspace')).toHaveAttribute('data-sound', 'off')
  await expect(headerSound(page)).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: /Switch to .* theme/ }).hover()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('region', { name: 'Interaction sounds', exact: true })
  await expect(settings.getByRole('button', { name: 'Preview sound', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.__motionAudio)).toEqual({ contexts: 0, notes: [] })

  await soundToggle(settings).click()
  await expect(headerSound(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.mq-workspace')).toHaveAttribute('data-sound', 'on')
  // Separate deliberate gestures from the engine's 120ms duplicate-cue protection.
  await page.waitForTimeout(150)
  await page.evaluate(() => { window.__motionAudio.notes = [] })
  await settings.getByRole('button', { name: 'Preview sound', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__motionAudio.notes.length)).toBeGreaterThan(0)
  expect(await page.evaluate(() => localStorage.getItem('myqbank-suave-sound-v1'))).toBe('on')

  await page.reload()
  await expect(headerSound(page)).toHaveAccessibleName('Mute soft sounds')
  await expect(settings.getByRole('button', { name: 'Preview sound', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: /Switch to .* theme/ }).hover()
  await nextFrame(page)
  expect(await page.evaluate(() => window.__motionAudio)).toEqual({ contexts: 0, notes: [] })
  await soundToggle(settings).click()
  await expect(settings.getByRole('button', { name: 'Preview sound', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: /Switch to .* theme/ }).click()
  expect(await page.evaluate(() => window.__motionAudio.notes)).toEqual([])
  await page.reload()
  await expect(headerSound(page)).toHaveAccessibleName('Enable soft sounds')
  expect(await page.evaluate(() => localStorage.getItem('myqbank-suave-sound-v1'))).toBe('off')
  expect(await page.evaluate(() => window.__motionAudio)).toEqual({ contexts: 0, notes: [] })
})

test('Test feedback has identical sound for right and wrong answers and reveals no grade before closure', async ({ page }) => {
  await installAudioProbe(page)
  await workspace(page)
  await headerSound(page).click()
  await page.getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: 'Test', exact: true }).click()
  await page.getByRole('button', { name: 'Start 5-question block', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible()
  await page.evaluate(() => {
    window.__earlyFeedback = false
    window.__feedbackObserver = new MutationObserver(() => {
      if (document.querySelector('.mq-explanation-pane,.mq-result,.mq-option--correct,.mq-option--incorrect')) window.__earlyFeedback = true
    })
    window.__feedbackObserver.observe(document.querySelector('.mq-workspace')!, { subtree: true, childList: true, attributes: true })
  })
  const sounds: Note[][] = []
  for (const answer of ['C', 'B']) {
    await page.getByRole('radio', { name: `Synthetic saved option ${answer}` }).check()
    await page.waitForTimeout(150)
    await page.evaluate(() => { window.__motionAudio.notes = [] })
    await page.getByRole('button', { name: 'Submit answer', exact: true }).click()
    await expect(page.getByText('Answer saved', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Explanation', { exact: true })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.__motionAudio.notes.length)).toBeGreaterThan(0)
    sounds.push(await page.evaluate(() => window.__motionAudio.notes))
    if (answer === 'C') await page.getByRole('button', { name: 'Next question', exact: true }).first().click()
  }
  expect(sounds[0]).toEqual(sounds[1])
  await page.getByRole('button', { name: 'End block', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'End this block?', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__earlyFeedback)).toBe(false)
  await page.evaluate(() => window.__feedbackObserver.disconnect())
  await page.getByRole('button', { name: 'End and review', exact: true }).click()
  await expect(page.getByLabel('Explanation', { exact: true })).toBeVisible()
  await expect(page.getByText('Correct answer', { exact: true })).toBeVisible()
})

test('reduced motion keeps dialogs, selection and question navigation immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    window.__motionTransforms = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      if (this.closest('.mq-workspace') && JSON.stringify(keyframes).includes('transform')) window.__motionTransforms.push(JSON.stringify(keyframes))
      return animate.call(this, keyframes, options)
    }
  })
  await workspace(page)
  const moving = () => page.evaluate(() => document.getAnimations().filter(animation => {
    const target = (animation.effect as KeyframeEffect | null)?.target
    return target instanceof Element && !!target.closest('.mq-workspace') && animation.playState === 'running'
  }).length)
  await page.getByRole('button', { name: 'Open chat', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Pídele a Claude una sesión', exact: true })).toBeVisible()
  expect(await moving()).toBe(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Start 5-question block', exact: true }).click()
  await page.getByRole('radio', { name: 'Synthetic saved option C' }).check()
  await page.getByRole('button', { name: 'Submit answer', exact: true }).click()
  await expect(page.getByLabel('Explanation', { exact: true })).toBeVisible()
  expect(await moving()).toBe(0)
  await page.getByRole('button', { name: 'Next question', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Question 2', exact: true })).toBeVisible()
  expect(await moving()).toBe(0)
  expect(await page.evaluate(() => window.__motionTransforms)).toEqual([])
  const flag = page.getByRole('button', { name: 'Flag', exact: true })
  await flag.hover()
  expect(await flag.evaluate(el => getComputedStyle(el).transform)).toBe('none')
})

for (const width of [320, 390]) test(`sound controls fit at ${width}px and hover/press do not shift neighboring targets`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await workspace(page)
  await page.evaluate(() => document.fonts.ready)
  const buttons = page.locator('.mq-header button')
  const layout = () => buttons.evaluateAll(elements => elements.map(element => {
    const button = element as HTMLElement
    return { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight }
  }))
  for (const button of await buttons.all()) {
    const box = (await button.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
  }
  const before = await layout()
  await headerSound(page).hover()
  await nextFrame(page)
  expect(await layout()).toEqual(before)
  await page.mouse.down()
  await nextFrame(page)
  expect(await layout()).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  await page.mouse.up()
  await expect(headerSound(page)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('region', { name: 'Interaction sounds', exact: true })
  for (const button of await settings.getByRole('button').all()) {
    await button.scrollIntoViewIfNeeded()
    const box = (await button.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
})


test('glass reflections follow the pointer and clear when reduced motion is enabled', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await workspace(page)
  const card = page.locator('.mq-resume')
  await card.hover({ position: { x: 30, y: 30 } })
  await expect.poll(() => card.evaluate(el => el.style.getPropertyValue('--mq-pointer-x'))).not.toBe('')
  const first = await card.evaluate(el => el.style.getPropertyValue('--mq-pointer-x'))
  await card.hover({ position: { x: 90, y: 30 } })
  await expect.poll(() => card.evaluate(el => el.style.getPropertyValue('--mq-pointer-x'))).not.toBe(first)
  expect(await page.locator('.mq-header').evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => card.evaluate(el => el.style.getPropertyValue('--mq-pointer-x'))).toBe('')
  await page.getByRole('button', { name: 'Open chat', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Pídele a Claude una sesión', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Continue chat', exact: true })).toBeFocused()
})
