import type { ReportDocument } from '@/lib/evaluations/report'
import type { ReportAssets, ReportImage } from '@/lib/evaluations/report-assets'

/**
 * Generador de PDF sin dependencias.
 *
 * Escribe un PDF 1.4 con fuentes base (Helvetica) en WinAnsiEncoding. Todo el
 * texto se codifica a WinAnsi antes de escribirse, así la longitud en
 * caracteres coincide con la longitud en bytes y las posiciones de la tabla
 * xref salen exactas.
 *
 * Pagina de verdad: cuando el cursor baja del margen inferior se cierra la
 * página y se abre otra, y el pie se estampa al final, cuando ya se sabe
 * cuántas páginas hay.
 *
 * Los logos entran como JPEG (`DCTDecode`) porque es el único formato de
 * imagen que un PDF admite sin recomprimir nada. Son opcionales: sin ellos el
 * informe sale igual, sólo que sin membrete.
 */

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN_X = 56
const MARGIN_TOP = 792
const MARGIN_BOTTOM = 72
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

/** Paleta del sistema, en el espacio de color del PDF. */
const INK = '0.05 0.12 0.24'
const INK_SOFT = '0.29 0.36 0.46'
const MUTED = '0.45 0.52 0.62'
const PRIMARY = '0.08 0.39 1'
const RULE = '0.89 0.91 0.94'
const BAND = '0.94 0.96 0.99'
const ZEBRA = '0.98 0.985 0.995'

export const REPORT_BRANDING = {
  university: 'UNIVERSIDAD TÉCNICA ESTATAL DE QUEVEDO',
  universityProper: 'Universidad Técnica Estatal de Quevedo',
  faculty: 'Unidad de Apoyo a la Inclusión',
  system: 'Detection-test · Evaluación · Análisis · Inclusión',
  developer: 'Olbrox Tech',
  developerNote: 'Desarrollo tecnológico',
}

type Font = 'regular' | 'bold'

/** Anchos medios de Helvetica. Suficiente para partir líneas sin desbordar. */
const AVERAGE_WIDTH: Record<Font, number> = { regular: 0.5, bold: 0.54 }

function widthOf(text: string, size: number, font: Font) {
  return text.length * size * AVERAGE_WIDTH[font]
}

function wrap(text: string, size: number, font: Font, maxWidth: number) {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '') {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of rawLine.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word
      if (widthOf(candidate, size, font) <= maxWidth || current === '') {
        current = candidate
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

/**
 * WinAnsi tiene sitio para la tipografía que usa el informe —viñetas, comillas
 * y rayas— en posiciones que no coinciden con Unicode. Sin esta tabla, cada
 * viñeta salía impresa como un signo de interrogación.
 */
const WIN_ANSI: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
}

function toWinAnsi(text: string) {
  let out = ''
  for (const char of text.normalize('NFC')) {
    const mapped = WIN_ANSI[char]
    if (mapped !== undefined) {
      out += String.fromCharCode(mapped)
      continue
    }
    const code = char.codePointAt(0) ?? 63
    out += code <= 0xff ? String.fromCharCode(code) : '?'
  }
  return out
}

function escapePdfText(text: string) {
  return toWinAnsi(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

type Placement = { name: string; x: number; y: number; width: number; height: number }

/** Encaja una imagen dentro de una caja sin deformarla. */
function fit(image: ReportImage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
  return { width: image.width * scale, height: image.height * scale }
}

class PdfWriter {
  private pages: string[][] = []
  private current: string[] = []
  private y = MARGIN_TOP

  constructor(
    private readonly footerLeft: string,
    private readonly footerDeveloper?: ReportImage,
  ) {}

  start() {
    this.current = []
    this.y = MARGIN_TOP
  }

  private closePage() {
    this.pages.push(this.current)
    this.current = []
    this.y = MARGIN_TOP
  }

  private ensureSpace(height: number) {
    if (this.y - height >= MARGIN_BOTTOM) return
    this.closePage()
  }

  get cursor() {
    return this.y
  }

  space(amount: number) {
    this.y -= amount
  }

  /** Fuerza el salto de página, para que un bloque no quede partido. */
  keepTogether(height: number) {
    this.ensureSpace(height)
  }

  raw(operators: string) {
    this.current.push(operators)
  }

  image(placement: Placement) {
    this.current.push(
      `q ${placement.width.toFixed(2)} 0 0 ${placement.height.toFixed(2)} ${placement.x.toFixed(2)} ${placement.y.toFixed(2)} cm /${placement.name} Do Q`,
    )
  }

  text(
    value: string,
    {
      size = 10,
      font = 'regular',
      indent = 0,
      color = INK,
      leading,
      maxWidth,
      align = 'left',
    }: {
      size?: number
      font?: Font
      indent?: number
      color?: string
      leading?: number
      maxWidth?: number
      align?: 'left' | 'center' | 'right'
    } = {},
  ) {
    const lineHeight = leading ?? size * 1.45
    const boxWidth = maxWidth ?? CONTENT_WIDTH - indent
    const lines = wrap(value, size, font, boxWidth)
    for (const line of lines) {
      this.ensureSpace(lineHeight)
      if (line !== '') {
        const resource = font === 'bold' ? '/F2' : '/F1'
        const lineWidth = widthOf(line, size, font)
        const offset =
          align === 'center' ? (boxWidth - lineWidth) / 2 : align === 'right' ? boxWidth - lineWidth : 0
        this.current.push(
          `BT ${resource} ${size} Tf ${color} rg ${MARGIN_X + indent + offset} ${this.y - size} Td (${escapePdfText(line)}) Tj ET`,
        )
      }
      this.y -= lineHeight
    }
  }

  rule(color = RULE, width = 0.8) {
    this.ensureSpace(10)
    this.current.push(`${color} RG ${width} w ${MARGIN_X} ${this.y} m ${PAGE_WIDTH - MARGIN_X} ${this.y} l S`)
    this.y -= 10
  }

  /** Banda de color a lo ancho del contenido, para encabezar un apartado. */
  band(height: number, color: string) {
    this.ensureSpace(height)
    this.current.push(`${color} rg ${MARGIN_X} ${this.y - height} ${CONTENT_WIDTH} ${height} re f`)
  }

  /** Fila de tabla con columnas de ancho fijo. */
  row(cells: string[], widths: number[], font: Font = 'regular', background?: string) {
    const size = 8.5
    const lineHeight = size * 1.4
    const columns = cells.map((cell, index) => wrap(cell, size, font, widths[index] - 10))
    const height = Math.max(...columns.map((lines) => lines.length)) * lineHeight + 8
    this.ensureSpace(height)

    if (background) {
      this.current.push(`${background} rg ${MARGIN_X} ${this.y - height + 4} ${CONTENT_WIDTH} ${height} re f`)
    }

    let x = MARGIN_X
    columns.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        const resource = font === 'bold' ? '/F2' : '/F1'
        const color = font === 'bold' ? INK : INK_SOFT
        this.current.push(
          `BT ${resource} ${size} Tf ${color} rg ${x + 5} ${this.y - size - 2 - lineIndex * lineHeight} Td (${escapePdfText(line)}) Tj ET`,
        )
      })
      x += widths[index]
    })

    this.current.push(
      `${RULE} RG 0.5 w ${MARGIN_X} ${this.y - height + 4} m ${PAGE_WIDTH - MARGIN_X} ${this.y - height + 4} l S`,
    )
    this.y -= height
  }

  /** Cierra el documento y estampa el pie, ya con el total de páginas. */
  finish() {
    if (this.current.length > 0) this.closePage()
    const total = this.pages.length

    return this.pages.map((content, index) => {
      const left = escapePdfText(this.footerLeft)
      const developer = escapePdfText(`Desarrollado por ${REPORT_BRANDING.developer}`)
      const right = escapePdfText(`Página ${index + 1} de ${total}`)
      const developerLogo = this.footerDeveloper ? fit(this.footerDeveloper, 88, 22) : null
      const developerX =
        MARGIN_X + CONTENT_WIDTH / 2 - (developerLogo ? developerLogo.width / 2 : widthOf(developer, 7, 'regular') / 2)
      return [
        ...content,
        `${RULE} RG 0.5 w ${MARGIN_X} 62 m ${PAGE_WIDTH - MARGIN_X} 62 l S`,
        `BT /F1 7 Tf ${MUTED} rg ${MARGIN_X} 48 Td (${left}) Tj ET`,
        developerLogo
          ? `q ${developerLogo.width.toFixed(2)} 0 0 ${developerLogo.height.toFixed(2)} ${developerX.toFixed(2)} ${(39 + (22 - developerLogo.height) / 2).toFixed(2)} cm /ImD Do Q`
          : `BT /F1 7 Tf ${MUTED} rg ${developerX.toFixed(2)} 48 Td (${developer}) Tj ET`,
        `BT /F1 7 Tf ${MUTED} rg ${PAGE_WIDTH - MARGIN_X - widthOf(right, 7, 'regular')} 48 Td (${right}) Tj ET`,
      ].join('\n')
    })
  }
}

function renderLetterhead(writer: PdfWriter, assets: ReportAssets) {
  const top = MARGIN_TOP
  const crestBox = { x: MARGIN_X + 34, y: top - 64, width: 54, height: 64 }
  if (assets.university) {
    const size = fit(assets.university, crestBox.width, crestBox.height)
    writer.image({
      name: 'ImU',
      x: crestBox.x + (crestBox.width - size.width) / 2,
      y: crestBox.y + (crestBox.height - size.height) / 2,
      width: size.width,
      height: size.height,
    })
  }

  const textX = crestBox.x + crestBox.width + 14
  writer.raw(`BT /F2 6.2 Tf ${PRIMARY} rg ${textX} ${top - 16} Td (${escapePdfText('INSTITUCIÓN ACADÉMICA')}) Tj ET`)
  writer.raw(`BT /F2 13 Tf ${INK} rg ${textX} ${top - 34} Td (${escapePdfText(REPORT_BRANDING.university)}) Tj ET`)
  writer.raw(`BT /F2 8 Tf ${MUTED} rg ${textX} ${top - 51} Td (${escapePdfText(REPORT_BRANDING.faculty)}) Tj ET`)

  const systemWidth = 230
  const systemX = MARGIN_X + (CONTENT_WIDTH - systemWidth) / 2
  const systemY = top - 118
  if (assets.system) {
    const size = fit(assets.system, systemWidth, 44)
    writer.image({ name: 'ImS', x: systemX + (systemWidth - size.width) / 2, y: systemY, width: size.width, height: size.height })
  }
  const caption = 'SISTEMA DE EVALUACIÓN'
  const captionWidth = widthOf(caption, 6.2, 'bold')
  writer.raw(`BT /F2 6.2 Tf ${MUTED} rg ${(systemX + (systemWidth - captionWidth) / 2).toFixed(2)} ${(systemY - 13).toFixed(2)} Td (${escapePdfText(caption)}) Tj ET`)

  writer.space(144)
  writer.rule(PRIMARY, 1.4)
  writer.space(10)
}

/** Ficha de cabecera: los tres datos que identifican el documento. */
function renderIdentityStrip(writer: PdfWriter, document: ReportDocument) {
  const height = 44
  writer.keepTogether(height + 6)
  writer.band(height, BAND)

  const columns = [
    { label: 'CÓDIGO DEL INFORME', value: document.code },
    { label: 'EVALUADO', value: document.subject },
    { label: 'FECHA DE EVALUACIÓN', value: document.date },
  ]
  const columnWidth = CONTENT_WIDTH / columns.length
  const top = writer.cursor

  columns.forEach((column, index) => {
    const x = MARGIN_X + columnWidth * index + 10
    writer.raw(`BT /F1 6.5 Tf ${MUTED} rg ${x} ${top - 16} Td (${escapePdfText(column.label)}) Tj ET`)
    const value = wrap(column.value, 9.5, 'bold', columnWidth - 20)[0] ?? ''
    writer.raw(`BT /F2 9.5 Tf ${INK} rg ${x} ${top - 32} Td (${escapePdfText(value)}) Tj ET`)
  })

  writer.space(height + 12)
}

function renderSummary(writer: PdfWriter, document: ReportDocument) {
  writer.keepTogether(96)
  writer.text('RESUMEN EJECUTIVO', { size: 8.5, font: 'bold', color: PRIMARY })
  writer.space(2)
  writer.rule(RULE, 0.6)

  for (const item of document.summary) {
    writer.keepTogether(26)
    writer.text(item.label.toUpperCase(), { size: 6.5, font: 'bold', color: MUTED })
    writer.text(item.value, { size: 9.2, leading: 12.8, color: INK })
    writer.space(3)
  }

  writer.space(6)
}

/**
 * Fila de tarjetas KPI — composición ejecutiva compacta. Los valores llegan
 * ya formateados desde `EvaluationAnalyticsSummary`; esta función sólo
 * dibuja, nunca recalcula.
 */
function renderKpiGrid(
  writer: PdfWriter,
  items: Array<{ label: string; value: string; detail?: string; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }>,
) {
  if (items.length === 0) return
  const columns = Math.min(4, items.length)
  const gap = 8
  const cellWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns
  const cellHeight = items.some((item) => item.detail) ? 62 : 48
  const rows = Math.ceil(items.length / columns)
  writer.keepTogether(rows * cellHeight + (rows - 1) * gap + 6)

  for (let row = 0; row < rows; row += 1) {
    const rowTop = writer.cursor
    for (let col = 0; col < columns; col += 1) {
      const item = items[row * columns + col]
      if (!item) continue
      const x = MARGIN_X + col * (cellWidth + gap)
      const y = rowTop - cellHeight
      const tone = pdfToneColor(item.tone)
      writer.raw(`1 1 1 rg ${x.toFixed(2)} ${y.toFixed(2)} ${cellWidth.toFixed(2)} ${cellHeight} re f`)
      writer.raw(`${RULE} RG ${x.toFixed(2)} ${y.toFixed(2)} ${cellWidth.toFixed(2)} ${cellHeight} re S`)
      writer.raw(`${tone} rg ${x.toFixed(2)} ${y.toFixed(2)} 3 ${cellHeight} re f`)
      const label = wrap(item.label.toUpperCase(), 6.4, 'bold', cellWidth - 16)[0] ?? item.label.toUpperCase()
      writer.raw(`BT /F2 6.4 Tf ${MUTED} rg ${(x + 8).toFixed(2)} ${(rowTop - 13).toFixed(2)} Td (${escapePdfText(label)}) Tj ET`)
      const value = wrap(item.value, 12.5, 'bold', cellWidth - 16)[0] ?? item.value
      writer.raw(`BT /F2 12.5 Tf ${INK} rg ${(x + 8).toFixed(2)} ${(rowTop - 31).toFixed(2)} Td (${escapePdfText(value)}) Tj ET`)
      if (item.detail) {
        const detail = wrap(item.detail, 6.4, 'regular', cellWidth - 18)[0] ?? item.detail
        writer.raw(`BT /F1 6.4 Tf ${MUTED} rg ${(x + 8).toFixed(2)} ${(y + 18).toFixed(2)} Td (${escapePdfText(detail)}) Tj ET`)
      }
      const progress = kpiProgressFromValue(item.value)
      if (progress !== null) {
        const trackWidth = cellWidth - 18
        writer.raw(`${RULE} rg ${(x + 8).toFixed(2)} ${(y + 8).toFixed(2)} ${trackWidth.toFixed(2)} 4 re f`)
        writer.raw(`${tone} rg ${(x + 8).toFixed(2)} ${(y + 8).toFixed(2)} ${(trackWidth * progress).toFixed(2)} 4 re f`)
      }
    }
    writer.space(cellHeight)
    if (row < rows - 1) writer.space(gap)
  }
  writer.space(6)
}

function pdfToneColor(tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | undefined) {
  if (tone === 'success') return '0.086 0.639 0.290'
  if (tone === 'warning') return '0.961 0.620 0.043'
  if (tone === 'danger') return '0.863 0.149 0.149'
  if (tone === 'neutral') return '0.580 0.639 0.722'
  return PRIMARY
}

function kpiProgressFromValue(value: string) {
  const percent = value.match(/^(\d+(?:\.\d+)?)%$/)
  if (percent) return Math.max(0, Math.min(1, Number(percent[1]) / 100))
  const ratio = value.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
  if (ratio) {
    const numerator = Number(ratio[1])
    const denominator = Number(ratio[2])
    if (denominator > 0) return Math.max(0, Math.min(1, numerator / denominator))
  }
  return null
}

function renderNote(writer: PdfWriter, title: string, text: string, items?: string[]) {
  const titleHeight = 12
  const bodyLines =
    items && items.length > 0
      ? items.flatMap((item) => wrap(`- ${item}`, 8.8, 'regular', CONTENT_WIDTH - 24))
      : wrap(text, 8.8, 'regular', CONTENT_WIDTH - 24)
  const height = titleHeight + bodyLines.length * 12 + 14
  writer.keepTogether(height)

  const start = writer.cursor
  writer.band(height, BAND)
  writer.raw(`${PRIMARY} rg ${MARGIN_X} ${start - height} 3 ${height} re f`)
  writer.space(8)
  writer.text(title.toUpperCase(), { size: 6.8, font: 'bold', color: PRIMARY, indent: 12, maxWidth: CONTENT_WIDTH - 24 })
  if (items && items.length > 0) {
    for (const item of items) {
      writer.text(`- ${item}`, { size: 8.8, leading: 12, color: INK_SOFT, indent: 12, maxWidth: CONTENT_WIDTH - 24 })
    }
  } else if (text) {
    writer.text(text, { size: 8.8, leading: 12, color: INK_SOFT, indent: 12, maxWidth: CONTENT_WIDTH - 24 })
  }

  const consumed = start - writer.cursor
  writer.space(Math.max(6, height - consumed + 4))
}

function renderChart(
  writer: PdfWriter,
  title: string,
  unit: string,
  source: string,
  values: Array<{ label: string; value: number; caption?: string }>,
  options: { type?: 'bar' | 'percentile' | 'donut' | 'flow' | 'gauge' | 'matrix' | 'stacked'; maxValue?: number; insight?: string } = {},
) {
  if (values.length === 0) return

  if (options.type === 'donut') {
    renderDonutChart(writer, title, unit, source, values, options.insight)
    return
  }
  if (options.type === 'flow') {
    renderFlowChart(writer, title, unit, source, values, options.insight)
    return
  }
  if (options.type === 'gauge') {
    renderGaugeChart(writer, title, unit, source, values, options.insight)
    return
  }
  if (options.type === 'matrix') {
    renderMatrixChart(writer, title, unit, source, values, options.insight)
    return
  }
  if (options.type === 'stacked') {
    renderStackedChart(writer, title, unit, source, values, options.insight)
    return
  }
  if (options.type === 'percentile') {
    renderPercentileChart(writer, title, unit, source, values, options.insight)
    return
  }

  const max = options.maxValue ?? Math.max(...values.map((item) => item.value), 1)
  const rowHeight = 15
  const shell = chartShell(writer, title, unit, source, options.insight, 52 + values.length * rowHeight)

  for (const item of values) {
    const label = wrap(item.label, 7.2, 'regular', 118)[0] ?? item.label
    const barWidth = Math.max(8, (item.value / max) * (shell.width - 180))
    const y = writer.cursor - 9
    writer.raw(`BT /F1 7.2 Tf ${INK_SOFT} rg ${shell.x} ${y} Td (${escapePdfText(label)}) Tj ET`)
    writer.raw(`${RULE} rg ${shell.x + 126} ${y - 1} ${(shell.width - 180).toFixed(2)} 7 re f`)
    writer.raw(`${PRIMARY} rg ${shell.x + 126} ${y - 1} ${barWidth.toFixed(2)} 7 re f`)
    writer.raw(`BT /F2 7.2 Tf ${INK} rg ${shell.x + shell.width - 45} ${y} Td (${escapePdfText(String(item.caption ?? item.value))}) Tj ET`)
    writer.space(rowHeight)
  }
  closeChartShell(writer, shell)
}

function chartShell(writer: PdfWriter, title: string, unit: string, source: string, insight: string | undefined, height: number) {
  const insightLines = insight ? wrap(insight, 7, 'regular', CONTENT_WIDTH - 34).slice(0, 2) : []
  const fullHeight = height + insightLines.length * 10
  writer.keepTogether(fullHeight + 10)
  const top = writer.cursor
  const y = top - fullHeight
  writer.raw(`1 1 1 rg ${MARGIN_X} ${y.toFixed(2)} ${CONTENT_WIDTH} ${fullHeight.toFixed(2)} re f`)
  writer.raw(`${RULE} RG ${MARGIN_X} ${y.toFixed(2)} ${CONTENT_WIDTH} ${fullHeight.toFixed(2)} re S`)
  writer.raw(`${PRIMARY} rg ${MARGIN_X} ${y.toFixed(2)} 3 ${fullHeight.toFixed(2)} re f`)
  writer.raw(`BT /F2 8.8 Tf ${INK} rg ${MARGIN_X + 14} ${(top - 16).toFixed(2)} Td (${escapePdfText(title)}) Tj ET`)
  writer.raw(`BT /F1 7 Tf ${MUTED} rg ${MARGIN_X + 14} ${(top - 28).toFixed(2)} Td (${escapePdfText(`${unit} - Fuente: ${source}`)}) Tj ET`)
  insightLines.forEach((line, index) => {
    writer.raw(`BT /F1 7 Tf ${INK_SOFT} rg ${MARGIN_X + 14} ${(top - 40 - index * 10).toFixed(2)} Td (${escapePdfText(line)}) Tj ET`)
  })
  writer.space(42 + insightLines.length * 10)
  return { x: MARGIN_X + 14, width: CONTENT_WIDTH - 28, top, height: fullHeight }
}

function closeChartShell(writer: PdfWriter, shell: { top: number; height: number }) {
  const consumed = shell.top - writer.cursor
  writer.space(Math.max(8, shell.height - consumed + 8))
}

function renderFlowChart(
  writer: PdfWriter,
  title: string,
  unit: string,
  source: string,
  values: Array<{ label: string; value: number; caption?: string }>,
  insight?: string,
) {
  const gap = 8
  const cols = Math.min(values.length, 5)
  const shell = chartShell(writer, title, unit, source, insight, 106)
  const boxWidth = (shell.width - gap * (cols - 1)) / cols
  const y = writer.cursor - 54
  values.slice(0, cols).forEach((item, index) => {
    const x = shell.x + index * (boxWidth + gap)
    writer.raw(`${BAND} rg ${x.toFixed(2)} ${y.toFixed(2)} ${boxWidth.toFixed(2)} 50 re f`)
    writer.raw(`${RULE} RG ${x.toFixed(2)} ${y.toFixed(2)} ${boxWidth.toFixed(2)} 50 re S`)
    writer.raw(`BT /F2 6.4 Tf ${PRIMARY} rg ${(x + 8).toFixed(2)} ${(y + 36).toFixed(2)} Td (${escapePdfText(String(index + 1).padStart(2, '0'))}) Tj ET`)
    writer.raw(`BT /F2 15 Tf ${INK} rg ${(x + 8).toFixed(2)} ${(y + 20).toFixed(2)} Td (${escapePdfText(String(item.caption ?? item.value))}) Tj ET`)
    writer.raw(`BT /F1 7 Tf ${INK_SOFT} rg ${(x + 8).toFixed(2)} ${(y + 8).toFixed(2)} Td (${escapePdfText(wrap(item.label, 7, 'regular', boxWidth - 16)[0] ?? item.label)}) Tj ET`)
    if (index < cols - 1) {
      writer.raw(`${PRIMARY} RG ${(x + boxWidth + 1).toFixed(2)} ${(y + 25).toFixed(2)} m ${(x + boxWidth + gap - 1).toFixed(2)} ${(y + 25).toFixed(2)} l S`)
    }
  })
  writer.space(62)
  closeChartShell(writer, shell)
}

function renderGaugeChart(
  writer: PdfWriter,
  title: string,
  unit: string,
  source: string,
  values: Array<{ label: string; value: number; caption?: string }>,
  insight?: string,
) {
  const item = values[0]
  if (!item) return
  const value = Math.max(0, Math.min(100, item.value))
  const shell = chartShell(writer, title, unit, source, insight, 94)
  const trackX = shell.x + 12
  const trackY = writer.cursor - 28
  const trackWidth = shell.width - 24
  writer.raw(`${RULE} rg ${trackX.toFixed(2)} ${trackY.toFixed(2)} ${trackWidth.toFixed(2)} 16 re f`)
  writer.raw(`0.86 0.92 1 rg ${trackX.toFixed(2)} ${trackY.toFixed(2)} ${(trackWidth * 0.4).toFixed(2)} 16 re f`)
  writer.raw(`0.82 0.95 0.94 rg ${(trackX + trackWidth * 0.4).toFixed(2)} ${trackY.toFixed(2)} ${(trackWidth * 0.35).toFixed(2)} 16 re f`)
  writer.raw(`0.86 0.97 0.90 rg ${(trackX + trackWidth * 0.75).toFixed(2)} ${trackY.toFixed(2)} ${(trackWidth * 0.25).toFixed(2)} 16 re f`)
  const markerX = trackX + (trackWidth * value) / 100
  writer.raw(`${PRIMARY} rg ${(markerX - 2).toFixed(2)} ${(trackY - 4).toFixed(2)} 4 24 re f`)
  writer.raw(`BT /F2 18 Tf ${INK} rg ${shell.x + 12} ${(trackY - 22).toFixed(2)} Td (${escapePdfText(String(item.caption ?? item.value))}) Tj ET`)
  writer.raw(`BT /F1 7.4 Tf ${INK_SOFT} rg ${shell.x + 80} ${(trackY - 18).toFixed(2)} Td (${escapePdfText(item.label)}) Tj ET`)
  writer.raw(`BT /F1 6.6 Tf ${MUTED} rg ${trackX.toFixed(2)} ${(trackY - 38).toFixed(2)} Td (0) Tj ET`)
  writer.raw(`BT /F1 6.6 Tf ${MUTED} rg ${(trackX + trackWidth / 2 - 4).toFixed(2)} ${(trackY - 38).toFixed(2)} Td (50) Tj ET`)
  writer.raw(`BT /F1 6.6 Tf ${MUTED} rg ${(trackX + trackWidth - 12).toFixed(2)} ${(trackY - 38).toFixed(2)} Td (100) Tj ET`)
  writer.space(70)
  closeChartShell(writer, shell)
}

function renderMatrixChart(
  writer: PdfWriter,
  title: string,
  unit: string,
  source: string,
  values: Array<{ label: string; value: number; caption?: string }>,
  insight?: string,
) {
  const rows = Math.ceil(values.length / 2)
  const shell = chartShell(writer, title, unit, source, insight, 48 + rows * 42)
  const boxWidth = (shell.width - 10) / 2
  values.forEach((item, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = shell.x + col * (boxWidth + 10)
    const y = writer.cursor - 32 - row * 38
    writer.raw(`${BAND} rg ${x.toFixed(2)} ${y.toFixed(2)} ${boxWidth.toFixed(2)} 32 re f`)
    writer.raw(`${RULE} RG ${x.toFixed(2)} ${y.toFixed(2)} ${boxWidth.toFixed(2)} 32 re S`)
    writer.raw(`${DONUT_COLORS[index % DONUT_COLORS.length]} rg ${(x + 6).toFixed(2)} ${y.toFixed(2)} 3 32 re f`)
    writer.raw(`BT /F2 13 Tf ${INK} rg ${(x + 8).toFixed(2)} ${(y + 16).toFixed(2)} Td (${escapePdfText(String(item.caption ?? item.value))}) Tj ET`)
    writer.raw(`BT /F1 7.2 Tf ${INK_SOFT} rg ${(x + 58).toFixed(2)} ${(y + 17).toFixed(2)} Td (${escapePdfText(wrap(item.label, 7.2, 'regular', boxWidth - 68)[0] ?? item.label)}) Tj ET`)
  })
  writer.space(rows * 38 + 8)
  closeChartShell(writer, shell)
}

function renderStackedChart(
  writer: PdfWriter,
  title: string,
  unit: string,
  source: string,
  values: Array<{ label: string; value: number; caption?: string }>,
  insight?: string,
) {
  const shell = chartShell(writer, title, unit, source, insight, 62 + values.length * 13)
  const total = Math.max(values.reduce((sum, item) => sum + item.value, 0), 1)
  let x = shell.x
  const y = writer.cursor - 12
  writer.raw(`${RULE} rg ${shell.x} ${y.toFixed(2)} ${shell.width.toFixed(2)} 14 re f`)
  values.forEach((item, index) => {
    const width = Math.max(3, (item.value / total) * shell.width)
    writer.raw(`${DONUT_COLORS[index % DONUT_COLORS.length]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} 14 re f`)
    x += width
  })
  writer.space(22)
  values.forEach((item, index) => {
    const rowY = writer.cursor - 8
    writer.raw(`${DONUT_COLORS[index % DONUT_COLORS.length]} rg ${shell.x} ${(rowY - 1).toFixed(2)} 7 7 re f`)
    writer.raw(`BT /F1 7.4 Tf ${INK_SOFT} rg ${shell.x + 12} ${rowY.toFixed(2)} Td (${escapePdfText(item.label)}) Tj ET`)
    const captionText = String(item.caption ?? item.value)
    const captionWidth = widthOf(captionText, 7.4, 'bold')
    writer.raw(`BT /F2 7.4 Tf ${INK} rg ${(PAGE_WIDTH - MARGIN_X - captionWidth).toFixed(2)} ${rowY.toFixed(2)} Td (${escapePdfText(captionText)}) Tj ET`)
    writer.space(13)
  })
  closeChartShell(writer, shell)
}

function renderPercentileChart(
  writer: PdfWriter,
  title: string,
  unit: string,
  source: string,
  values: Array<{ label: string; value: number; caption?: string }>,
  insight?: string,
) {
  const shell = chartShell(writer, title, unit, source, insight, 72 + values.length * 13)

  const x = shell.x
  const y = writer.cursor - 12
  writer.raw(`0.996 0.906 0.906 rg ${x} ${y} ${(shell.width * 0.25).toFixed(2)} 12 re f`)
  writer.raw(`0.996 0.953 0.780 rg ${(x + shell.width * 0.25).toFixed(2)} ${y} ${(shell.width * 0.5).toFixed(2)} 12 re f`)
  writer.raw(`0.863 0.973 0.902 rg ${(x + shell.width * 0.75).toFixed(2)} ${y} ${(shell.width * 0.25).toFixed(2)} 12 re f`)
  values.forEach((item, index) => {
    const dotX = x + (Math.max(0, Math.min(100, item.value)) / 100) * shell.width
    writer.raw(`${DONUT_COLORS[index % DONUT_COLORS.length]} rg ${(dotX - 2.5).toFixed(2)} ${(y - 4).toFixed(2)} 5 20 re f`)
  })
  writer.raw(`BT /F1 6.4 Tf ${MUTED} rg ${x} ${(y - 11).toFixed(2)} Td (0) Tj ET`)
  writer.raw(`BT /F1 6.4 Tf ${MUTED} rg ${(x + shell.width * 0.25 - 7).toFixed(2)} ${(y - 11).toFixed(2)} Td (25) Tj ET`)
  writer.raw(`BT /F1 6.4 Tf ${MUTED} rg ${(x + shell.width * 0.5 - 7).toFixed(2)} ${(y - 11).toFixed(2)} Td (50) Tj ET`)
  writer.raw(`BT /F1 6.4 Tf ${MUTED} rg ${(x + shell.width * 0.75 - 7).toFixed(2)} ${(y - 11).toFixed(2)} Td (75) Tj ET`)
  writer.raw(`BT /F1 6.4 Tf ${MUTED} rg ${(x + shell.width - 12).toFixed(2)} ${(y - 11).toFixed(2)} Td (100) Tj ET`)
  writer.space(32)

  values.forEach((item, index) => {
    const rowY = writer.cursor - 8
    writer.raw(`${DONUT_COLORS[index % DONUT_COLORS.length]} rg ${shell.x} ${(rowY - 1).toFixed(2)} 7 7 re f`)
    writer.raw(`BT /F1 7.4 Tf ${INK_SOFT} rg ${shell.x + 12} ${rowY.toFixed(2)} Td (${escapePdfText(wrap(item.label, 7.4, 'regular', 300)[0] ?? item.label)}) Tj ET`)
    const captionText = String(item.caption ?? item.value)
    const captionWidth = widthOf(captionText, 7.4, 'bold')
    writer.raw(`BT /F2 7.4 Tf ${INK} rg ${(PAGE_WIDTH - MARGIN_X - captionWidth).toFixed(2)} ${rowY.toFixed(2)} Td (${escapePdfText(captionText)}) Tj ET`)
    writer.space(13)
  })
  closeChartShell(writer, shell)
}

/**
 * Paleta del donut, en el mismo orden que usa el conic-gradient de la vista
 * previa HTML — así el mismo dato pinta igual en pantalla y en el PDF.
 */
const DONUT_COLORS = [
  '0.086 0.639 0.290', // verde
  '0.145 0.388 0.922', // azul
  '0.961 0.620 0.043', // ámbar
  '0.863 0.149 0.149', // rojo
  '0.580 0.639 0.722', // gris pizarra
]

/** Punto sobre una circunferencia, medido en grados en sentido horario desde arriba. */
function polarPoint(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + radius * Math.sin(rad), y: cy + radius * Math.cos(rad) }
}

/**
 * Dona de verdad — un anillo partido en gajos proporcionales, con el total en
 * el centro y una leyenda a la derecha. Antes esto se dibujaba como una barra
 * horizontal apilada con la etiqueta "donut", que no se parecía en nada a lo
 * que muestra la vista previa.
 */
function renderDonutChart(
  writer: PdfWriter,
  title: string,
  unit: string,
  source: string,
  values: Array<{ label: string; value: number; caption?: string }>,
  insight?: string,
) {
  const outerRadius = 44
  const innerRadius = 26
  const legendRowHeight = 14
  const chartHeight = Math.max(outerRadius * 2 + 10, values.length * legendRowHeight)
  const shell = chartShell(writer, title, unit, source, insight, chartHeight + 14)

  const rawTotal = values.reduce((sum, item) => sum + item.value, 0)
  const total = Math.max(rawTotal, 1)
  const top = writer.cursor
  const cx = shell.x + outerRadius + 4
  const cy = top - outerRadius - 4

  let angle = 0
  values.forEach((item, index) => {
    const sweep = (item.value / total) * 360
    if (sweep > 0.05) {
      const color = DONUT_COLORS[index % DONUT_COLORS.length]
      const steps = Math.max(1, Math.ceil(sweep / 4))
      const points: string[] = []
      for (let i = 0; i <= steps; i += 1) {
        const t = angle + (sweep * i) / steps
        const p = polarPoint(cx, cy, outerRadius, t)
        points.push(`${p.x.toFixed(2)} ${p.y.toFixed(2)} ${i === 0 ? 'm' : 'l'}`)
      }
      for (let i = steps; i >= 0; i -= 1) {
        const t = angle + (sweep * i) / steps
        const p = polarPoint(cx, cy, innerRadius, t)
        points.push(`${p.x.toFixed(2)} ${p.y.toFixed(2)} l`)
      }
      writer.raw(`${color} rg ${points.join(' ')} h f`)
    }
    angle += sweep
  })

  const totalLabel = String(rawTotal)
  const totalWidth = widthOf(totalLabel, 13, 'bold')
  writer.raw(
    `BT /F2 13 Tf ${INK} rg ${(cx - totalWidth / 2).toFixed(2)} ${(cy - 5).toFixed(2)} Td (${escapePdfText(totalLabel)}) Tj ET`,
  )

  const legendX = cx + outerRadius + 24
  const legendWidth = Math.max(60, MARGIN_X + CONTENT_WIDTH - legendX - 18)
  let legendY = top - 6
  values.forEach((item, index) => {
    const color = DONUT_COLORS[index % DONUT_COLORS.length]
    writer.raw(`${color} rg ${legendX.toFixed(2)} ${(legendY - 8).toFixed(2)} 8 8 re f`)
    const label = wrap(item.label, 8, 'regular', legendWidth)[0] ?? item.label
    writer.raw(`BT /F1 8 Tf ${INK_SOFT} rg ${(legendX + 12).toFixed(2)} ${(legendY - 7).toFixed(2)} Td (${escapePdfText(label)}) Tj ET`)
    const captionText = String(item.caption ?? item.value)
    const captionWidth = widthOf(captionText, 8, 'bold')
    writer.raw(
      `BT /F2 8 Tf ${INK} rg ${(PAGE_WIDTH - MARGIN_X - captionWidth).toFixed(2)} ${(legendY - 7).toFixed(2)} Td (${escapePdfText(captionText)}) Tj ET`,
    )
    legendY -= legendRowHeight
  })

  writer.space(chartHeight + 2)
  closeChartShell(writer, shell)
}

/** Créditos del cierre: universidad y quien desarrolla el sistema. */
function renderDocument(document: ReportDocument, assets: ReportAssets) {
  const writer = new PdfWriter(`${document.code} · Detection-test`, assets.developer)
  writer.start()

  renderLetterhead(writer, assets)

  writer.text(document.title.toUpperCase(), { size: 16, font: 'bold', color: INK, align: 'center' })
  writer.space(10)
  renderIdentityStrip(writer, document)
  renderSummary(writer, document)

  for (const section of document.sections) {
    writer.keepTogether(48)
    writer.space(10)
    writer.band(24, BAND)
    writer.raw(`${PRIMARY} rg ${MARGIN_X} ${writer.cursor - 24} 4 24 re f`)
    writer.space(7)
    writer.text(`${section.number}.  ${section.title.toUpperCase()}`, { size: 9.8, font: 'bold', color: INK, indent: 12 })
    writer.space(4)

    for (const block of section.blocks) {
      if (block.kind === 'paragraph') {
        writer.text(block.text, { size: 9.5, leading: 14 })
        writer.space(4)
      }

      if (block.kind === 'note') {
        renderNote(writer, block.title, block.text, block.items)
      }

      if (block.kind === 'subheading') {
        writer.space(5)
        writer.text(block.text, { size: 9, font: 'bold', color: INK_SOFT })
        writer.space(2)
      }

      if (block.kind === 'pairs') {
        for (const item of block.items) {
          writer.keepTogether(26)
          writer.text(item.label.toUpperCase(), { size: 6.5, font: 'bold', color: MUTED })
          writer.text(item.value, { size: 9.5, leading: 13 })
          writer.space(4)
        }
      }

      if (block.kind === 'list') {
        for (const item of block.items) {
          // El separador va en el sangrado, no en espacios: `wrap` normaliza
          // los espacios repetidos y los dejaría en uno solo.
          writer.text(`- ${item}`, { size: 9.5, indent: 10, leading: 13.5, color: INK })
          writer.space(2)
        }
        writer.space(4)
      }

      if (block.kind === 'chart') {
        renderChart(writer, block.title, block.unit, block.source, block.values, {
          type: block.type,
          maxValue: block.maxValue,
          insight: block.insight,
        })
      }

      if (block.kind === 'kpi-grid') {
        renderKpiGrid(writer, block.items)
      }

      if (block.kind === 'table') {
        const columnCount = block.headers.length
        const widths =
          columnCount === 4
            ? [CONTENT_WIDTH * 0.42, CONTENT_WIDTH * 0.28, CONTENT_WIDTH * 0.13, CONTENT_WIDTH * 0.17]
            : Array.from({ length: columnCount }, () => CONTENT_WIDTH / columnCount)
        writer.keepTogether(60)
        if (block.caption) {
          writer.text(block.caption, { size: 7.5, color: MUTED })
          writer.space(3)
        }
        writer.row(block.headers, widths, 'bold', BAND)
        block.rows.forEach((row, index) => writer.row(row, widths, 'regular', index % 2 === 1 ? ZEBRA : undefined))
        writer.space(8)
      }
    }
  }

  return writer.finish()
}

/** Bytes binarios como cadena latin-1, que es como se serializa el PDF. */
function bytesToBinaryString(bytes: Uint8Array) {
  let out = ''
  for (let index = 0; index < bytes.length; index += 1) out += String.fromCharCode(bytes[index])
  return out
}

export function generatePsychopedagogicalReport(document: ReportDocument, assets: ReportAssets = {}): Blob {
  const pages = renderDocument(document, assets)

  const images: { name: string; image: ReportImage }[] = []
  if (assets.university) images.push({ name: 'ImU', image: assets.university })
  if (assets.system) images.push({ name: 'ImS', image: assets.system })
  if (assets.developer) images.push({ name: 'ImD', image: assets.developer })

  const objects: string[] = []
  // 1 catálogo, 2 páginas, 3 y 4 las fuentes, después las imágenes.
  const imageIdStart = 5
  const pageObjectStart = imageIdStart + images.length
  const pageIds = pages.map((_, index) => pageObjectStart + index * 2)
  const contentIds = pages.map((_, index) => pageObjectStart + index * 2 + 1)

  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  images.forEach(({ image }) => {
    const data = bytesToBinaryString(image.bytes)
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n${data}\nendstream`,
    )
  })

  const xobjects = images.length
    ? ` /XObject << ${images.map(({ name }, index) => `/${name} ${imageIdStart + index} 0 R`).join(' ')} >>`
    : ''

  pages.forEach((content, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects} >> /Contents ${contentIds[index]} 0 R >>`,
    )
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`

  const pdf = `${body}${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  // El PDF ya es Latin-1 puro; se convierte byte a byte para que el navegador
  // no lo re-codifique como UTF-8 y desplace todos los offsets.
  const bytes = new Uint8Array(pdf.length)
  for (let index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index) & 0xff

  return new Blob([bytes], { type: 'application/pdf' })
}
