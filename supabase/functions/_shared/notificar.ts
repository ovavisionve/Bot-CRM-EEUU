// Notifica al admin cuando llega un mensaje nuevo o un evento importante

export async function notificarAdmin(data: {
  senderId: string
  mensaje: string
  tipo?: string
}) {
  const whatsapp = Deno.env.get("ADMIN_WHATSAPP") || "+584245781707"

  // Generar link de WhatsApp con el mensaje pre-armado
  const texto = encodeURIComponent(
    `[Bot IG] Nuevo ${data.tipo || "mensaje"} de ${data.senderId}: "${data.mensaje}"`
  )
  const link = `https://wa.me/${whatsapp.replace(/\+/g, "")}?text=${texto}`

  // Por ahora solo logueamos — la notificación push se implementa
  // cuando conectemos un servicio de email o WhatsApp Business API
  console.log("[notificar] Evento para el admin:", {
    senderId: data.senderId,
    mensaje: data.mensaje.substring(0, 100),
    tipo: data.tipo || "mensaje",
    whatsappLink: link,
  })
}
