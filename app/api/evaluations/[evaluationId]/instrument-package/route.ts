import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { MAX_PACKAGE_SIZE } from '@/lib/instruments/import/file-safety'
import { runImportPipeline, type IncomingFile } from '@/lib/instruments/import/import-pipeline'
import type { PackageStage } from '@/lib/instruments/import/package-model'

/**
 * Incorporación de un paquete de instrumento.
 *
 * Acepta lo que el profesional tenga: un archivo, varios, el contenido de una
 * carpeta o un comprimido. Todo el procesamiento ocurre aquí, en el servidor:
 * abrir un ZIP que ha subido alguien no es trabajo del navegador, y hacerlo en
 * el cliente dejaría los límites de seguridad en manos de quien sube el archivo.
 *
 * La respuesta es un flujo NDJSON: un evento por cada etapa real que se
 * completa, y un evento final con el paquete analizado. Así la pantalla de
 * procesamiento anima hitos reales, no un progreso simulado. Los errores del
 * proveedor de IA o del descompresor no cruzan esta frontera: al profesional
 * le llega el estado de su material, no el detalle técnico de por qué falló
 * algo.
 */

export const runtime = 'nodejs'
/** El análisis de un paquete con varios PDF no cabe en el timeout por defecto. */
export const maxDuration = 60

export async function POST(request: Request, { params }: { params: Promise<{ evaluationId: string }> }) {
  const session = await requirePermission('evaluations.update')
  const { evaluationId } = await params

  const form = await request.formData()
  const entries = form.getAll('files')
  // Las rutas relativas viajan aparte: un `<input webkitdirectory>` las trae y
  // son las que conservan la estructura de carpetas del paquete original.
  const paths = form.getAll('paths').map((value) => String(value))
  const instruction = form.get('instruction')
  const contextRaw = form.get('context')

  if (entries.length === 0) {
    return NextResponse.json({ error: 'Selecciona el material del instrumento.' }, { status: 400 })
  }

  const files: IncomingFile[] = []
  let total = 0

  for (const [index, entry] of entries.entries()) {
    if (!(entry instanceof File)) continue
    total += entry.size
    if (total > MAX_PACKAGE_SIZE) {
      return NextResponse.json({ error: 'El material supera el tamaño permitido.' }, { status: 413 })
    }
    files.push({
      path: paths[index] || entry.name,
      declaredMime: entry.type,
      bytes: new Uint8Array(await entry.arrayBuffer()),
    })
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'Selecciona el material del instrumento.' }, { status: 400 })
  }

  let context: unknown = undefined
  if (typeof contextRaw === 'string' && contextRaw.trim()) {
    try {
      context = JSON.parse(contextRaw)
    } catch {
      // Un contexto ilegible se descarta en vez de romper el análisis.
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: { type: 'stage'; stage: PackageStage } | { type: 'error'; message: string }) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      try {
        const { pkg, blueprint, notices } = await runImportPipeline({
          evaluationId,
          createdBy: session.user.id,
          files,
          instruction: typeof instruction === 'string' && instruction.trim() ? instruction.trim() : undefined,
          context,
          onStage: (stage) => send({ type: 'stage', stage }),
        })
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done', package: pkg, blueprint, notices })}\n`))
      } catch (error) {
        console.error('[instrument-package] procesamiento fallido', error)
        send({ type: 'error', message: 'No fue posible procesar el material.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
