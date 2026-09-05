import { NextResponse } from 'next/server'
import { checkGeminiConnection } from '@/lib/ai/gemini'
import { requirePermission } from '@/lib/auth/session'

/**
 * Salud del proveedor de IA. Observabilidad, no producto.
 *
 * Vive detrás de `audit_logs.read` a propósito: qué proveedor hay detrás, qué
 * modelo y con cuánta latencia responde es información de administración. La
 * pantalla del profesional no la consulta ni la muestra.
 */
export async function GET() {
  try {
    await requirePermission('audit_logs.read')
  } catch {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  try {
    return NextResponse.json(await checkGeminiConnection())
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        latencyMs: 0,
        message: error instanceof Error ? error.message : 'No se pudo verificar el proveedor de IA.',
      },
      { status: 502 },
    )
  }
}
