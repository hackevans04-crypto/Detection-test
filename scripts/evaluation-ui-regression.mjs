import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const evaluationId = process.env.E2E_EVALUATION_ID ?? '35418c91-ad0c-451e-af56-2ab77382c0b2'
const artifactsDir = path.join(process.cwd(), 'artifacts')

const routes = [
  '/evaluaciones',
  `/evaluaciones/${evaluationId}/instrumentos`,
  `/evaluaciones/${evaluationId}/resultados`,
  `/evaluaciones/${evaluationId}/conclusiones`,
  `/evaluaciones/${evaluationId}/recomendaciones`,
  `/evaluaciones/${evaluationId}/informe`,
  `/evaluaciones/${evaluationId}/informe/preview`,
]

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

async function pageMetrics(page, route, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('body', { timeout: 60_000 })
  await page.waitForFunction(() => !/Cargando evaluaci[oó]n/i.test(document.body.innerText), null, { timeout: 60_000 }).catch(() => {})
  if (/\/informe\/preview$/.test(route)) {
    await page.waitForSelector('.dt-pdf-frame, .dt-pdf-loading, [role="alert"]', { timeout: 60_000 }).catch(() => {})
    await page.waitForFunction(() => Boolean(document.querySelector('.dt-pdf-frame')) || !/Preparando PDF/i.test(document.body.innerText), null, { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(2500)
  }
  await page.waitForTimeout(500)

  const safeRoute = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
  await page.screenshot({
    path: path.join(artifactsDir, `ui-regression-${viewport.name}-${safeRoute}.png`),
    fullPage: true,
  })

  return page.evaluate(
    ({ routeName, viewportName }) => {
      const text = document.body.innerText
      const stepper = document.querySelector('.dt-flow')
      const stepperItems = [...document.querySelectorAll('.dt-flow-item')]
      const stepperRect = stepper?.getBoundingClientRect()
      const lastRect = stepperItems.at(-1)?.getBoundingClientRect()
      const viewer = document.querySelector('.dt-viewer')
      const viewerDoc = document.querySelector('.dt-viewer-doc')
      const pdfFrame = document.querySelector('.dt-pdf-frame')

      return {
        route: routeName,
        viewport: viewportName,
        url: location.pathname,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        mojibakeVisible: /Ã|Â|â|�/.test(text),
        staleNineStepCopy: /(?:\b6\s*\/\s*9\b|\b6\s+de\s+9\b|\b9\s+etapas\b)/i.test(text),
        wrongNoInstrumentCopy: /No se aplicaron instrumentos/i.test(text),
        stepperItems: stepperItems.length,
        stepperVisible:
          !stepper ||
          (stepperRect &&
            stepperRect.left >= -1 &&
            stepperRect.right <= window.innerWidth + 1 &&
            (!lastRect || lastRect.right <= window.innerWidth + 1)),
        viewerOk:
          !viewer ||
          pdfFrame instanceof HTMLIFrameElement ||
          pdfFrame instanceof HTMLObjectElement ||
          (viewerDoc &&
            getComputedStyle(viewer).overflowX === 'hidden' &&
            ['auto', 'scroll', 'visible'].includes(getComputedStyle(viewerDoc).overflowY)),
        reportMentionsInstrument:
          !/\/informe(?:\/preview)?$/.test(location.pathname) ||
          (/\/informe\/preview$/.test(location.pathname) && (pdfFrame instanceof HTMLIFrameElement || pdfFrame instanceof HTMLObjectElement)) ||
          viewer?.getAttribute('data-report-has-instruments') === 'true' ||
          /STAI|MACI|ENFEN|TEST ABC|Instrumentos integrados|Instrumentos y técnicas|Instrumentos y tecnicas/i.test(text),
      }
    },
    { routeName: route, viewportName: viewport.name },
  )
}

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const runtimeErrors = []

  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  const checks = []
  try {
    for (const viewport of viewports) {
      for (const route of routes) {
        checks.push(await pageMetrics(page, route, viewport))
      }
    }
  } finally {
    await context.close()
    await browser.close()
  }

  const report = { runtimeErrors, checks }
  fs.writeFileSync(path.join(artifactsDir, 'evaluation-ui-regression.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))

  const failedChecks = checks.filter(
    (check) =>
      check.horizontalOverflow > 2 ||
      check.mojibakeVisible ||
      check.staleNineStepCopy ||
      check.wrongNoInstrumentCopy ||
      check.stepperItems !== 0 && check.stepperItems !== 10 ||
      !check.stepperVisible ||
      !check.viewerOk ||
      !check.reportMentionsInstrument,
  )

  if (runtimeErrors.length > 0 || failedChecks.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
