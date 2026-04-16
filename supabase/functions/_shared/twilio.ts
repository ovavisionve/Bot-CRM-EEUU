// Helper para enviar SMS vía Twilio usando las credenciales del tenant.

export async function enviarSMS(
  to: string,
  body: string,
  twilioSid: string | null | undefined,
  twilioToken: string | null | undefined,
  twilioPhone: string | null | undefined,
): Promise<{ ok: boolean; error?: string; sid?: string }> {
  if (!twilioSid || !twilioToken || !twilioPhone) {
    console.error("[twilio] Credenciales Twilio faltantes")
    return { ok: false, error: "Twilio credentials missing" }
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`
  const auth = btoa(`${twilioSid}:${twilioToken}`)

  const formData = new URLSearchParams()
  formData.append("To", to)
  formData.append("From", twilioPhone)
  formData.append("Body", body)

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error("[twilio] Error:", data)
      return { ok: false, error: data.message }
    }
    return { ok: true, sid: data.sid }
  } catch (err) {
    console.error("[twilio] Fetch error:", err)
    return { ok: false, error: String(err) }
  }
}
