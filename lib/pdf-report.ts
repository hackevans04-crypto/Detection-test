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
  developerNote: 'Desarrollo del sistema',
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

  constructor(private readonly footerLeft: string) {}

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
      const right = escapePdfText(`Página ${index + 1} de ${total}`)
      return [
        ...content,
        `${RULE} RG 0.5 w ${MARGIN_X} 56 m ${PAGE_WIDTH - MARGIN_X} 56 l S`,
        `BT /F1 7 Tf ${MUTED} rg ${MARGIN_X} 44 Td (${left}) Tj ET`,
        `BT /F1 7 Tf ${MUTED} rg ${PAGE_WIDTH - MARGIN_X - widthOf(right, 7, 'regular')} 44 Td (${right}) Tj ET`,
      ].join('\n')
    })
  }
}

/** Membrete institucional: universidad a la izquierda, sistema a la derecha. */
function renderLetterhead(writer: PdfWriter, assets: ReportAssets) {
  const top = MARGIN_TOP
  const boxHeight = 46

  if (assets.university) {
    const size = fit(assets.university, 46, boxHeight)
    writer.image({ name: 'ImU', x: MARGIN_X, y: top - size.height, width: size.width, height: size.height })
  }
  if (assets.system) {
    const size = fit(assets.system, 108, boxHeight - 6)
    writer.image({
      name: 'ImS',
      x: PAGE_WIDTH - MARGIN_X - size.width,
      y: top - boxHeight + (boxHeight - size.height) / 2,
      width: size.width,
      height: size.height,
    })
  }

  writer.space(8)
  writer.text(REPORT_BRANDING.university, {
    size: 9,
    font: 'bold',
    color: INK,
    indent: assets.university ? 58 : 0,
    maxWidth: CONTENT_WIDTH - 180,
  })
  writer.text(REPORT_BRANDING.faculty, {
    size: 7.5,
    color: MUTED,
    indent: assets.university ? 58 : 0,
    maxWidth: CONTENT_WIDTH - 180,
  })
  writer.text(REPORT_BRANDING.system, {
    size: 7.5,
    color: PRIMARY,
    indent: assets.university ? 58 : 0,
    maxWidth: CONTENT_WIDTH - 180,
  })

  writer.space(12)
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

function renderNote(writer: PdfWriter, title: string, text: string) {
  const titleHeight = 12
  const textLines = wrap(text, 8.8, 'regular', CONTENT_WIDTH - 24)
  const height = titleHeight + textLines.length * 12 + 14
  writer.keepTogether(height)

  const start = writer.cursor
  writer.band(height, BAND)
  writer.raw(`${PRIMARY} rg ${MARGIN_X} ${start - height} 3 ${height} re f`)
  writer.space(8)
  writer.text(title.toUpperCase(), { size: 6.8, font: 'bold', color: PRIMARY, indent: 12, maxWidth: CONTENT_WIDTH - 24 })
  writer.text(text, { size: 8.8, leading: 12, color: INK_SOFT, indent: 12, maxWidth: CONTENT_WIDTH - 24 })

  const consumed = start - writer.cursor
  writer.space(Math.max(6, height - consumed + 4))
}

/** Créditos del cierre: universidad y quien desarrolla el sistema. */
function renderCredits(writer: PdfWriter, assets: ReportAssets) {
  // Cabe al pie de la última página de contenido; reservar de más lo mandaba
  // solo a una hoja en blanco.
  writer.keepTogether(54)
  writer.space(10)
  writer.rule()
  writer.space(4)

  writer.text(REPORT_BRANDING.developerNote.toUpperCase(), { size: 6.5, font: 'bold', color: MUTED })
  writer.space(2)

  const textTop = writer.cursor
  if (assets.developer) {
    const size = fit(assets.developer, 96, 26)
    writer.image({ name: 'ImD', x: MARGIN_X, y: textTop - size.height, width: size.width, height: size.height })
    writer.space(size.height + 6)
  } else {
    writer.text(REPORT_BRANDING.developer, { size: 10, font: 'bold', color: INK })
  }

  writer.text(
    `${REPORT_BRANDING.developer} para la ${REPORT_BRANDING.universityProper}. Documento generado por Detection-test.`,
    { size: 7.5, color: MUTED },
  )
}

function renderDocument(document: ReportDocument, assets: ReportAssets) {
  const writer = new PdfWriter(`${document.subject} · ${document.code}`)
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
        renderNote(writer, block.title, block.text)
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
          writer.text(`• ${item}`, { size: 9.5, indent: 10, leading: 13.5, color: INK })
          writer.space(2)
        }
        writer.space(4)
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

  renderCredits(writer, assets)
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
