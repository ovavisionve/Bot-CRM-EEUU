// app/api/webhook/route.js
// Webhook de Instagram — OVA VISION

// Fuerza ejecución dinámica en Node (no cacheable): Meta hace la petición GET
// con parámetros variables y espera el hub.challenge en tiempo real.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/webhook
 * Handshake de verificación de Meta.
 *
 * Meta llama con los query params:
 *   - hub.mode=subscribe
 *   - hub.verify_token=<el token configurado en el dashboard>
 *   - hub.challenge=<string random que debemos devolver tal cual>
 *
 * Respondemos 200 con el challenge en texto plano si el token coincide,
 * o 403 en cualquier otro caso.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const expected = process.env.META_VERIFY_TOKEN

  if (!expected) {
    console.error('[webhook:GET] META_VERIFY_TOKEN no está configurado en el entorno')
    return new Response('Server misconfigured', { status: 500 })
  }

  if (mode === 'subscribe' && token === expected && challenge) {
    console.log('[webhook:GET] Verificación OK — devolviendo challenge')
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('[webhook:GET] Verificación rechazada', { mode, tokenMatch: token === expected })
  return new Response('Unauthorized', { status: 403 })
}

export async function POST(request) {
  // TODO (paso 3): recibir eventos de Instagram, detectar respuesta,
  // enviar DM, guardar lead y notificar al admin.
  return new Response('OK', { status: 200 })
}
