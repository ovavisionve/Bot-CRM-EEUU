// app/api/webhook/route.js
// Webhook de Instagram — OVA VISION
// Paso 1: scaffolding. La lógica real de verificación (GET) y eventos (POST)
// se implementa en los pasos 2 y 3 del plan.

export async function GET(request) {
  // TODO (paso 2): validar hub.mode / hub.verify_token y responder hub.challenge
  return new Response('Webhook endpoint — pendiente de implementación', { status: 200 })
}

export async function POST(request) {
  // TODO (paso 3): recibir eventos de Instagram, detectar respuesta,
  // enviar DM, guardar lead y notificar al admin.
  return new Response('OK', { status: 200 })
}
