/**
 * Rasterizado de un texto del DOM para poder imprimirlo con partículas.
 *
 * `buildPrintField` sabe muestrear cualquier `CanvasImageSource`, y un logotipo
 * ya lo es —su `<img>`—. Un titular no: hay que dibujarlo antes en un lienzo, y
 * ahí está toda la dificultad de este módulo, porque el resultado tiene que
 * caer EXACTAMENTE encima del texto real. Si el rasterizado se desplaza medio
 * píxel, el relevo entre la nube y el texto de verdad se ve como un salto.
 *
 * Por eso no se recompone la maquetación: se lee. Cada nodo de texto se
 * pregunta por sus propias cajas de línea con un `Range`, que es lo que el
 * navegador acaba de calcular de verdad, incluidos el corte de línea, el
 * `letter-spacing` y el ancho real de cada glifo. Reimplementar el salto de
 * línea a partir de `measureText` habría sido inventar una segunda maquetación
 * que sólo por casualidad coincide con la primera.
 *
 * Trabajar por NODO DE TEXTO y no por elemento tiene un segundo premio: cada
 * nodo trae el color de su propio padre, así que el `<em>` cian del titular o
 * un `<br>` en mitad de un `<h2>` salen bien sin ningún caso especial.
 */

/** Cajas de línea con un tamaño por debajo de esto no aportan nada. */
const MIN_LINE = 0.5

type Line = { top: number; left: number; text: string }

const transform = (text: string, mode: string) => {
  if (mode === 'uppercase') return text.toUpperCase()
  if (mode === 'lowercase') return text.toLowerCase()
  if (mode === 'capitalize') return text.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
  return text
}

/**
 * Reparte un nodo de texto en sus líneas tal y como el navegador las pintó.
 *
 * Va carácter a carácter porque `Range.getClientRects()` devuelve las cajas
 * pero no dice qué trozo de texto le corresponde a cada una, y ese reparto es
 * justo lo que hace falta para volver a dibujarlas. El coste es un puñado de
 * medidas por texto y se paga una sola vez, al construir el campo.
 */
function linesOf(node: Text): Line[] {
  const raw = node.data
  const range = document.createRange()
  const lines: Line[] = []
  let current: Line | null = null

  for (let index = 0; index < raw.length; index += 1) {
    range.setStart(node, index)
    range.setEnd(node, index + 1)
    const box = range.getBoundingClientRect()
    // Espacio colapsado en un salto de línea: el navegador no le da caja.
    if (box.width < MIN_LINE && box.height < MIN_LINE) continue

    if (!current || Math.abs(box.top - current.top) > 1) {
      // Una línea no empieza por un espacio: su caja existe, pero el texto
      // real arranca después y dibujarlo correría la línea entera.
      if (raw[index] === ' ' || raw[index] === '\n' || raw[index] === '\t') continue
      current = { top: box.top, left: box.left, text: raw[index] }
      lines.push(current)
    } else {
      current.text += raw[index]
    }
  }

  return lines
}

/**
 * Dibuja el texto de `element` en un lienzo del tamaño de su caja.
 *
 * Devuelve `null` cuando no hay nada que dibujar; quien llama se queda entonces
 * con el texto normal, que es el comportamiento correcto: el efecto no puede
 * ser la razón de que un titular no se lea.
 */
export function rasterizeText(element: HTMLElement, width: number, height: number, dpr: number): HTMLCanvasElement | null {
  if (width < 4 || height < 4) return null

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.scale(dpr, dpr)
  context.textBaseline = 'alphabetic'

  const origin = element.getBoundingClientRect()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let painted = false

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    if (!text.data.trim()) continue
    const parent = text.parentElement
    if (!parent) continue

    const style = window.getComputedStyle(parent)
    if (style.visibility === 'hidden' || style.display === 'none') continue

    /*
      Sin `line-height` en la taquigrafía de `font`.

      El canvas la acepta y la ignora, pero algunos motores dejan de reconocer
      la cadena entera si el valor viene en píxeles con decimales, y entonces se
      queda con la fuente por defecto: el titular salía en Times sin avisar.
    */
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    context.fillStyle = style.color
    // Chrome, Safari 17.4 y Firefox 122 en adelante. Donde no exista, la
    // asignación se ignora y el rasterizado sale con el espaciado natural.
    if (style.letterSpacing && style.letterSpacing !== 'normal') {
      ;(context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = style.letterSpacing
    }

    /*
      Línea base a partir de la métrica de la fuente, no del alto de la caja.

      Las cajas que devuelve `Range` van del ascendente al descendente de la
      fuente, así que sumando el ascendente al borde superior se cae justo en la
      línea base. Con `textBaseline: 'top'` el texto bailaba unos píxeles en
      vertical según la familia, que es exactamente lo que no puede pasar aquí.
    */
    const ascent = context.measureText('Mg').fontBoundingBoxAscent
    const mode = style.textTransform

    for (const line of linesOf(text)) {
      context.fillText(
        transform(line.text, mode),
        line.left - origin.left,
        line.top - origin.top + ascent,
      )
      painted = true
    }
  }

  return painted ? canvas : null
}
