import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const evaluationId = process.env.E2E_EVALUATION_ID ?? '35418c91-ad0c-451e-af56-2ab77382c0b2'
const fixtureTerm = process.env.E2E_INSTRUMENT_TERM ?? 'STAI'
const artifactsDir = path.join(process.cwd(), 'artifacts')

function findArchive(term) {
  const downloads = path.join(os.homedir(), 'Downloads')
  const archive = fs
    .readdirSync(downloads)
    .find((name) => name.toLowerCase().includes(term.toLowerCase()) && /\.rar$/i.test(name))
  if (!archive) throw new Error(`No se encontro RAR real para ${term} en ${downloads}.`)
  return path.join(downloads, archive)
}

async function bodyText(page) {
  return page.locator('body').innerText()
}

async function clickPrimary(page, name) {
  const button = page.getByRole('button', { name }).first()
  await button.waitFor({ state: 'visible', timeout: 60_000 })
  await button.scrollIntoViewIfNeeded()
  await button.click()
}

async function waitForAnalysis(page) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText
      return (
        /archivos internos procesados/.test(text) ||
        /archivo interno procesado/.test(text) ||
        /Material relacionado/.test(text) ||
        /No fue posible procesar/.test(text) ||
        /El material supera/.test(text)
      )
    },
    null,
    { timeout: 240_000 },
  )
}

async function visible(locator) {
  return locator.first().isVisible().catch(() => false)
}

async function visibleButton(page, name) {
  return visible(page.getByRole('button', { name }))
}

async function validateConclusionLayout(page, label) {
  return page.evaluate((viewportLabel) => {
    const card = document.querySelector('.dt-ai-draft-card')
    const list = document.querySelector('.dt-ai-draft-list')
    const workspace = document.querySelector('.dt-conclusions-workspace')
    const evidence = document.querySelector('.dt-ai-draft-evidence')
    const footerButton = [...document.querySelectorAll('button')].find((button) => /Siguiente/i.test(button.textContent ?? ''))
    const cardRect = card?.getBoundingClientRect()
    const workspaceStyle = workspace ? getComputedStyle(workspace) : null
    const text = card?.querySelector('p')
    const textStyle = text ? getComputedStyle(text) : null
    const ratio = document.documentElement.scrollHeight / Math.max(window.innerHeight, 1)
    const maxScrollRatio = viewportLabel === 'mobile' ? 5 : 3.2

    return {
      label: viewportLabel,
      hasCard: Boolean(card),
      hasList: Boolean(list),
      cardWidth: Math.round(cardRect?.width ?? 0),
      gridTemplateColumns: workspaceStyle?.gridTemplateColumns ?? '',
      sourcesCollapsed: Boolean(evidence && !evidence.hasAttribute('open')),
      textWrapsNormally: textStyle?.wordBreak !== 'break-all' && textStyle?.whiteSpace !== 'pre',
      noInfiniteScroll: ratio <= maxScrollRatio,
      continueDisabledBeforeAccept: footerButton instanceof HTMLButtonElement ? footerButton.disabled : null,
    }
  }, label)
}

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  const report = {
    step6Complete: false,
    step6To7: false,
    step7ResultsReceived: false,
    step7CompletionState: false,
    stepper7Check: false,
    step7To8: false,
    conclusionEvidence: false,
    aiConclusionDrafts: false,
    step8Completion: false,
    step8To9: false,
    recommendationDrafts: false,
    step9To10: false,
    refreshPersistence: false,
    conclusionLayout: false,
    noInfiniteScroll: false,
    evidenceCollapse: false,
    continueEnabled: false,
    viewports: {},
    runtimeErrors,
  }

  try {
    const archivePath = findArchive(fixtureTerm)
    await page.goto(`${baseUrl}/evaluaciones/${evaluationId}/instrumentos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('text=Instrumentos IA', { timeout: 60_000 })
    await page.locator('input[type=file]').first().setInputFiles(archivePath)
    await page.getByRole('button', { name: /Analizar instrumento/i }).click()
    await waitForAnalysis(page)
    let text = await bodyText(page)
    report.step6Complete =
      /archivos internos procesados|archivo interno procesado|Material relacionado/i.test(text) &&
      !/No fue posible procesar|El material supera/i.test(text)

    await clickPrimary(page, /Siguiente/i)
    await page.waitForURL(/\/resultados$/, { timeout: 60_000 })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('text=Resultados e interpretación', { timeout: 60_000 })
    text = await bodyText(page)
    await page.screenshot({ path: path.join(artifactsDir, 'evaluation-flow-results.png'), fullPage: true })
    report.step6To7 = /\/resultados$/.test(page.url())
    report.step7ResultsReceived = /bundle recibido|bundles recibidos|Resultados transferidos desde Instrumentos IA|Cierre con limitaciones/i.test(text)

    await clickPrimary(page, /Siguiente/i)
    await page.waitForURL(/\/conclusiones$/, { timeout: 60_000 })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('text=Conclusiones', { timeout: 60_000 })
    text = await bodyText(page)
    await page.screenshot({ path: path.join(artifactsDir, 'evaluation-flow-conclusions.png'), fullPage: true })

    report.step7To8 = /\/conclusiones$/.test(page.url())
    report.step7CompletionState = await page.getByLabel(/7\. Resultados \(completada\)/i).first().isVisible().catch(() => false)
    report.stepper7Check = report.step7CompletionState
    report.conclusionEvidence = /Resumen de evidencia|Resultados transferidos|Instrumentos/i.test(text)
    report.aiConclusionDrafts = /Conclusiones profesionales/i.test(text) && /Borrador IA/i.test(text)

    const viewportChecks = [
      ['1366x768', 1366, 768],
      ['1440x900', 1440, 900],
      ['1920x1080', 1920, 1080],
      ['mobile', 390, 844],
    ]
    for (const [label, width, height] of viewportChecks) {
      await page.setViewportSize({ width, height })
      report.viewports[label] = await validateConclusionLayout(page, label)
      await page.screenshot({ path: path.join(artifactsDir, `evaluation-flow-conclusions-${label}.png`), fullPage: true })
    }
    const viewportPasses = Object.values(report.viewports).every(
      (check) =>
        check.hasCard &&
        check.hasList &&
        check.sourcesCollapsed &&
        check.textWrapsNormally &&
        check.noInfiniteScroll &&
        (check.label === 'mobile' ? check.cardWidth >= 300 : check.cardWidth >= 520),
    )
    report.conclusionLayout = viewportPasses
    report.noInfiniteScroll = Object.values(report.viewports).every((check) => check.noInfiniteScroll)
    report.evidenceCollapse = Object.values(report.viewports).every((check) => check.sourcesCollapsed)

    await page.setViewportSize({ width: 1440, height: 1100 })
    await clickPrimary(page, /Aceptar/i)
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find((item) => /Siguiente/i.test(item.textContent ?? ''))
      return button instanceof HTMLButtonElement && !button.disabled
    }, null, { timeout: 30_000 })
    report.continueEnabled = true
    await clickPrimary(page, /Siguiente/i)
    await page.waitForURL(/\/recomendaciones$/, { timeout: 60_000 })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('text=Recomendaciones', { timeout: 60_000 })
    text = await bodyText(page)
    await page.screenshot({ path: path.join(artifactsDir, 'evaluation-flow-recommendations.png'), fullPage: true })

    report.step8To9 = /\/recomendaciones$/.test(page.url())
    report.step8Completion = await page.getByLabel(/8\. Conclusiones \(completada\)/i).first().isVisible().catch(() => false)
    report.recommendationDrafts =
      /Sugerencias listas para revisar|Recomendaciones sugeridas por Detection AI/i.test(text) ||
      (await visibleButton(page, /Usar todas|Usar sugerencias|Usar/i))

    if (await visibleButton(page, /Usar todas/i)) {
      await clickPrimary(page, /Usar todas/i)
    } else if (await visibleButton(page, /Usar sugerencias/i)) {
      await clickPrimary(page, /Usar sugerencias/i)
    } else if (await visibleButton(page, /^Usar$/i)) {
      await clickPrimary(page, /^Usar$/i)
    }
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find((item) => /Siguiente/i.test(item.textContent ?? ''))
      return button instanceof HTMLButtonElement && !button.disabled
    }, null, { timeout: 30_000 })
    await clickPrimary(page, /Siguiente/i)
    await page.waitForURL(/\/informe$/, { timeout: 60_000 })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('text=Informe final', { timeout: 60_000 })
    await page.screenshot({ path: path.join(artifactsDir, 'evaluation-flow-final-report.png'), fullPage: true })

    report.step9To10 = /\/informe$/.test(page.url())
    report.refreshPersistence =
      (await page.getByLabel(/8\. Conclusiones \(completada\)/i).first().isVisible().catch(() => false)) &&
      (await page.getByLabel(/9\. Recomendaciones \(completada\)/i).first().isVisible().catch(() => false))
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(path.join(artifactsDir, 'evaluation-flow-e2e.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))

  const failed = Object.entries(report).some(([key, value]) =>
    key === 'runtimeErrors' ? value.length > 0 : key === 'viewports' ? false : value !== true,
  )
  if (failed) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
