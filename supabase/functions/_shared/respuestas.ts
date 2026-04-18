// Motor de respuestas usando OpenRouter API
// Genera respuestas usando la voz del agente configurado en el tenant.

import { obtenerPropiedades, formatearPropiedadesParaPrompt } from "./sheets.ts"
import { computeStage } from "./extractor.ts"
import type { Tenant, AgentConfig } from "./tenant.ts"

function buildSystemPrompt(
  propiedadesTexto: string,
  leadEstado: any,
  tenant: Partial<Tenant> | null,
  agentConfig: AgentConfig | null
): string {
  const agentName = tenant?.agent_name || "Luis Almario"
  const agentArea = "Miami"
  const agentPhone = tenant?.agent_phone || ""
  const agentPhoneClean = agentPhone.replace(/[^0-9]/g, "")

  // Estado del lead: SOLO campos con valor real
  const stateLines: string[] = []
  if (leadEstado.name) stateLines.push("Nombre: " + leadEstado.name)
  if (leadEstado.partner_name) stateLines.push("Pareja: " + leadEstado.partner_name)
  if (leadEstado.move_in_date) stateLines.push("Fecha mudanza: " + leadEstado.move_in_date)
  if (leadEstado.occupants) stateLines.push("Ocupantes: " + leadEstado.occupants)
  if (leadEstado.pets) stateLines.push("Mascotas: " + leadEstado.pets)
  if (leadEstado.credit_score) stateLines.push("Credito: " + leadEstado.credit_score)
  if (leadEstado.preferred_unit) stateLines.push("Tipo: " + leadEstado.preferred_unit)
  if (leadEstado.selected_property_name) stateLines.push("PROPIEDAD ELEGIDA: " + leadEstado.selected_property_name)
  if (leadEstado.tour_date) stateLines.push("TOUR AGENDADO: " + leadEstado.tour_date)
  if (leadEstado.tour_confirmed) stateLines.push("TOUR CONFIRMADO: si")
  if (leadEstado.budget_max) stateLines.push("Presupuesto max: $" + leadEstado.budget_max)
  const estadoTexto = stateLines.length > 0
    ? "LO QUE YA SABES DE ESTE LEAD (no vuelvas a preguntar esto):\n" + stateLines.join("\n")
    : "Todavia no sabes nada de este lead. Empeza con el saludo."

  // Computar etapa y lo que falta
  const { stage, needed, nextQuestion } = computeStage(leadEstado)
  const stageBlock = `ETAPA ACTUAL: ${stage}
${needed.length > 0 ? "TE FALTA SABER: " + needed.join(", ") : "Ya tenes toda la info necesaria."}
SIGUIENTE PASO: ${nextQuestion}`

  // Instrucciones por etapa (solo las relevantes)
  let stageInstructions = ""
  switch (stage) {
    case "QUALIFYING":
      stageInstructions = `Estas calificando al lead. Pregunta lo que falta de forma natural. Si el lead te da varios datos juntos, aceptalos todos y avanza. No preguntes cosas de a una si podes combinar 2 preguntas.`
      break
    case "PRESENTING_PROPERTIES":
      stageInstructions = `El lead ya esta calificado. Presenta las opciones de propiedades: SOLO nombre y precio mensual. NADA MAS (no fees, no parking, no detalles). Pregunta cual le interesa.`
      break
    case "SCHEDULING_TOUR":
      stageInstructions = `El lead ya eligio propiedad. Da la direccion y pregunta cuando puede ir a verla (dia y hora).`
      break
    case "GETTING_NAME":
      stageInstructions = `Ya tiene propiedad y dia. Pedi el nombre completo (y el de la pareja si tiene).`
      break
    case "CONFIRMING":
      stageInstructions = `Ya tenes todo: nombre + propiedad + dia. Confirma el tour y despedite. No sigas hablando.`
      break
    case "DISQUALIFIED":
      stageInstructions = `Credito insuficiente. Despedite amablemente, sugerite que mejore su credito y vuelva a contactarte.`
      break
  }

  return `Sos ${agentName}, agente de bienes raices en ${agentArea}. Vendes y alquilas apartamentos. Respondes por Instagram DM.

PERSONALIDAD:
Amigable, directo, casual. Mensajes CORTOS. Bilingue: si te escriben en espanol, contesta en espanol. Si en ingles, contesta en ingles informal. Solo usas 👍 para confirmar. Nunca reveles que sos IA.

PRESENTACION (solo la primera vez):
Si es el primer mensaje, presentate: "Hola! Soy ${agentName}, un gusto" o "Hello! ${agentName} here, nice to meet you". Despues NO te vuelvas a presentar.

EN ESPANOL: Usas "!", "?", tildes correctas. "Perfecto! 👍", "Cuando te quieres mudar?", "Genial!", "Dale!", "Listo!".
EN INGLES: Informal con errores leves. "Is you alone?", "When you planning to move?", "See you their!".

${estadoTexto}

${stageBlock}
${stageInstructions}

${propiedadesTexto}

REGLAS ABSOLUTAS:
- NO menciones fees, parking, internet, amenidades a menos que el lead PREGUNTE especificamente
- NO repitas informacion que ya dijiste
- NO vuelvas a preguntar algo que ya sabes (mira "LO QUE YA SABES")
- NO inventes propiedades que no estan en tu lista
- Maximo 3 mensajes cortos por respuesta (2-12 palabras cada uno)
- Al presentar propiedades: SOLO nombre y precio. Ejemplo: "Coral Terrace 2BR $2,850/mes"
- Si el lead cambia de opinion: acepta sin drama, pregunta cuando puede ver la nueva
- Si se frustra o dice "no entiendes": "Disculpa! Te paso mi WhatsApp: ${agentPhoneClean}"
- Si manda info en partes: trata todo como UNA sola respuesta
- Si ya confirmo todo: despedite. No sigas hablando

FORMATO:
Separa cada mensaje corto con "---" en una linea propia.

${agentPhoneClean ? "WHATSAPP: Tu numero es " + agentPhoneClean + ". Ofrecelo despues de agendar o si tiene dudas." : ""}`
}

interface HistorialMsg {
  direction: string
  message_text: string
}

export async function generarRespuesta(
  mensajeNuevo: string,
  historial: HistorialMsg[],
  leadEstado: any = {},
  tenant: Partial<Tenant> | null = null,
  agentConfig: AgentConfig | null = null
): Promise<string[]> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")

  if (!apiKey) {
    console.error("[respuestas] OPENROUTER_API_KEY no configurada")
    return ["Hello, one moment please"]
  }

  // Fuente de propiedades: Google Sheet o tabla properties segun feature flag
  let propiedadesTexto = "No properties available yet."
  if (tenant?.features?.google_sheets_properties && tenant?.google_sheet_id) {
    const propiedades = await obtenerPropiedades(tenant.google_sheet_id)
    propiedadesTexto = formatearPropiedadesParaPrompt(propiedades)
  } else if (tenant?.id) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2")
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    const { data } = await sb
      .from("properties")
      .select("name, address, bedrooms, bathrooms, base_price, fees, promotions, min_credit_score, pets_allowed, notes, available")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .eq("available", true)
      .order("priority", { ascending: false })
    if (data && data.length > 0) {
      // Formato 2 secciones igual que Sheet
      let basica = "LISTA DE PROPIEDADES (presenta SOLO esto al lead):\n"
      let detalles = "\nDETALLES (SOLO compartir si el lead PREGUNTA por fees, parking o detalles):\n"
      for (const p of data) {
        basica += `- ${p.name}: ${p.address}`
        if (p.bedrooms != null && p.bathrooms != null) basica += ` (${p.bedrooms}BR/${p.bathrooms}BA)`
        if (p.base_price) basica += ` — $${p.base_price}/mes`
        basica += "\n"

        const detLines: string[] = []
        const fees = p.fees || {}
        if (fees.monthly_fees) detLines.push("Fees: $" + fees.monthly_fees + (fees.includes ? " (" + fees.includes + ")" : ""))
        if (fees.parking_1 != null) detLines.push("Parking: $" + fees.parking_1 + (fees.parking_2 != null ? ", 2nd $" + fees.parking_2 : ""))
        const promos = p.promotions || []
        if (promos.length > 0) detLines.push("Promo: " + promos.map((x: any) => x.description).join(", "))
        if (p.notes) detLines.push("Nota: " + p.notes)
        if (detLines.length > 0) {
          detalles += `${p.name}: ${detLines.join(". ")}\n`
        }
      }
      propiedadesTexto = basica + detalles
    }
  }

  const systemPrompt = buildSystemPrompt(propiedadesTexto, leadEstado, tenant, agentConfig)

  // Limitar historial a ultimos 10 mensajes
  const historialReciente = historial.slice(-10)

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ]

  // Si hay historial anterior al recorte, agregar resumen
  if (historial.length > 10) {
    const oldMessages = historial.slice(0, -10)
    const resumen = oldMessages
      .map((m) => `${m.direction === "inbound" ? "Lead" : "Agent"}: ${m.message_text}`)
      .join("\n")
    messages.push({
      role: "system",
      content: `RESUMEN de mensajes anteriores (ya procesados):\n${resumen.substring(0, 500)}`,
    })
  }

  for (const msg of historialReciente) {
    messages.push({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.message_text,
    })
  }

  messages.push({ role: "user", content: mensajeNuevo })

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        max_tokens: 512,
        temperature: 0.7,
        messages,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error("[respuestas] Error de OpenRouter:", res.status, error)
      return ["Hello, one moment please"]
    }

    const data = await res.json()
    const textoCompleto = data.choices?.[0]?.message?.content || "Hello, one moment please"

    const mensajes = textoCompleto
      .split("---")
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 0)

    return mensajes
  } catch (err) {
    console.error("[respuestas] Error llamando a OpenRouter:", err)
    return ["Hello, one moment please"]
  }
}
