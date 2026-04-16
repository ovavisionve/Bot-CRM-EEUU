// Notifica al admin cuando hay eventos importantes
// Envía email via Gmail (Apps Script webhook) + loggea link de WhatsApp

interface NotificarData {
  senderId: string
  mensaje: string
  tipo?: string
  leadName?: string
}

const EVENTOS_IMPORTANTES = ["tour_agendado", "calificado", "handoff", "disqualified"]
const EMAIL_TOKEN = "ova_email_secret_2026"

export async function notificarAdmin(data: NotificarData) {
  const email = Deno.env.get("ADMIN_EMAIL") || "ovavision.ve@gmail.com"
  const whatsapp = Deno.env.get("ADMIN_WHATSAPP") || "+584245781707"
  const gmailWebhook = Deno.env.get("GMAIL_WEBHOOK_URL")

  // Link de WhatsApp con el mensaje pre-armado
  const waText = encodeURIComponent(
    `[Bot IG] ${data.tipo || "nuevo mensaje"} de ${data.leadName || data.senderId}: "${data.mensaje}"`
  )
  const waLink = `https://wa.me/${whatsapp.replace(/\+/g, "")}?text=${waText}`

  console.log("[notificar] Evento:", {
    senderId: data.senderId,
    tipo: data.tipo || "mensaje",
    mensaje: data.mensaje.substring(0, 100),
    whatsappLink: waLink,
  })

  // Email solo para eventos críticos
  if (!EVENTOS_IMPORTANTES.includes(data.tipo || "")) return

  if (!gmailWebhook) {
    console.warn("[notificar] GMAIL_WEBHOOK_URL no configurado - skipping email")
    return
  }

  const subject = getSubject(data)
  const html = getEmailHtml(data, waLink)

  try {
    const res = await fetch(gmailWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: EMAIL_TOKEN,
        to: email,
        subject,
        html,
      }),
    })

    if (!res.ok) {
      console.error("[notificar] Error Gmail webhook:", res.status, await res.text())
    } else {
      const result = await res.json()
      console.log("[notificar] Email enviado a", email, "-", subject, result)
    }
  } catch (err) {
    console.error("[notificar] Error enviando email:", err)
  }
}

function getSubject(data: NotificarData): string {
  const nombre = data.leadName || data.senderId
  switch (data.tipo) {
    case "tour_agendado":
      return `🏠 Tour agendado - ${nombre}`
    case "calificado":
      return `✅ Lead calificado - ${nombre}`
    case "handoff":
      return `🚨 ${nombre} quiere hablar contigo`
    case "disqualified":
      return `⚠️ Lead descalificado - ${nombre}`
    default:
      return `Nueva actividad del bot`
  }
}

function getEmailHtml(data: NotificarData, waLink: string): string {
  const nombre = data.leadName || "Lead " + data.senderId
  const dashboardLink = `https://ovavisionve.github.io/Bot-CRM-EEUU/dashboard.html?lead=${data.senderId}`

  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1a73e8; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0;">${getSubject(data)}</h2>
  </div>
  <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
    <p><strong>Lead:</strong> ${escapeHtml(nombre)}</p>
    <p><strong>Tipo de evento:</strong> ${data.tipo}</p>
    <p><strong>Último mensaje:</strong></p>
    <div style="background: white; padding: 12px; border-left: 3px solid #1a73e8; margin: 10px 0;">
      ${escapeHtml(data.mensaje)}
    </div>
    <div style="margin-top: 20px;">
      <a href="${dashboardLink}" style="background: #1a73e8; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">Ver en Dashboard</a>
      <a href="${waLink}" style="background: #25d366; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Responder WhatsApp</a>
    </div>
  </div>
  <p style="text-align: center; color: #888; font-size: 12px; margin-top: 30px;">
    OVA VISION Agency - Bot Instagram
  </p>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
