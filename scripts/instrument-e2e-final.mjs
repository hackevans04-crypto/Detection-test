import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const evaluationId = '35418c91-ad0c-451e-af56-2ab77382c0b2'
const terms = ['STAI', 'MACI', 'ENFEN']
const artifactsDir = path.join(process.cwd(), 'artifacts')

function findArchive(term) {
  const downloads = path.join(os.homedir(), 'Downloads')
  const archive = fs
    .readdirSync(downloads)
    .find((name) => name.toLowerCase().includes(term.toLowerCase()) && /\.rar$/i.test(name))
  if (!archive) throw new Error(`No se encontro RAR real para ${term} en ${downloads}.`)
  return path.join(downloads, archive)
}

async function visibleText(page) {
  return page.locator('body').innerText()
}

async function waitForAnalysis(page) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText
      return (
        /archivos internos procesados/.test(text) ||
        /archivo interno procesado/.test(text) ||
        /No fue posible procesar/.test(text) ||
        /El material supera/.test(text)
      )
    },
    null,
    { timeout: 240_000 },
  )
}

async function runInstrument(browser, term) {
  const archivePath = findArchive(term)
  const archiveName = path.basename(archivePath)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(`${baseUrl}/evaluaciones/${evaluationId}/instrumentos`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await page.waitForSelector('text=Instrumentos IA', { timeout: 60_000 })
  await page.locator('input[type=file]').first().setInputFiles(archivePath)
  await page.getByRole('button', { name: /Analizar instrumento/i }).click()
  await waitForAnalysis(page)

  const afterAnalysis = await visibleText(page)
  await page.screenshot({ path: path.join(artifactsDir, `playwright-${term.toLowerCase()}-final.png`), fullPage: true })

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('text=Instrumentos IA', { timeout: 60_000 })
  const afterReload = await visibleText(page)

  const saveContinue = page.getByRole('button', { name: /Siguiente/i })
  await saveContinue.scrollIntoViewIfNeeded()
  await saveContinue.click()
  await page.waitForURL(/\/resultados$/, { timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
  const step7Text = await visibleText(page)
  await page.screenshot({ path: path.join(artifactsDir, `playwright-${term.toLowerCase()}-step7-final.png`), fullPage: true })

  await context.close()

  const internalMatch = /(\d+)\s+archivos? internos? procesados?/.exec(afterAnalysis)
  const resultMatch = /(\d+)\s+bundle recibido|(\d+)\s+bundles recibidos/i.exec(step7Text)
  const limitationReceived = /Cierre con limitaciones|Instrumento digitalizado sin aplicación completada/i.test(step7Text)

  return {
    instrument: term,
    archiveName,
    internalFileCount: internalMatch ? Number(internalMatch[1]) : 0,
    identity: new RegExp(term, 'i').test(afterAnalysis) ? term : 'NO_DETECTADA',
    routeError: /No fue posible procesar|El material supera/.test(afterAnalysis),
    archiveNotClinicalDocument: !/1 material analizado/.test(afterAnalysis),
    mojibakeVisible: /Ã|Â|â|ï¿½/.test(afterAnalysis + step7Text),
    runtimeErrors: errors,
    applicationStatus: /No se detectaron respuestas/.test(afterAnalysis)
      ? 'NO_APPLICATION_FOUND'
      : /Resultados|resultado|respuestas/i.test(afterAnalysis)
        ? 'EVIDENCE_AVAILABLE'
        : 'UNKNOWN',
    importedResultCount: resultMatch ? Number(resultMatch[1] ?? resultMatch[2]) : 0,
    normativeCapability: /No aplicable normativamente|No normativa/i.test(afterAnalysis + step7Text) ? false : 'UNKNOWN',
    bundleGenerated: /bundle recibido|bundles recibidos|Resultados transferidos desde Instrumentos IA/i.test(step7Text),
    limitationReceived,
    step7Received: /Resultados transferidos desde Instrumentos IA|bundle recibido|bundles recibidos/i.test(step7Text) || limitationReceived,
    reloadPersistence: new RegExp(term, 'i').test(afterReload) && /archivos? internos? procesados?/.test(afterReload),
    deduplicationPass: 'NOT_RUN_IN_BROWSER',
  }
}

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const results = []
  try {
    for (const term of terms) {
      results.push(await runInstrument(browser, term))
    }
  } finally {
    await browser.close()
  }

  fs.writeFileSync(path.join(artifactsDir, 'instrument-e2e-final.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(results, null, 2))

  const hardFailure = results.some(
    (result) =>
      result.routeError ||
      !result.archiveNotClinicalDocument ||
      result.mojibakeVisible ||
      result.runtimeErrors.length > 0 ||
      result.internalFileCount <= 1 ||
      !result.reloadPersistence ||
      !result.step7Received,
  )
  if (hardFailure) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
