// Google Apps Script — Webhook para enviar emails desde Gmail
//
// CÓMO USAR:
// 1. Abrí https://script.google.com
// 2. Clic en "Nuevo proyecto"
// 3. Borrá todo el código y pegá este script
// 4. Menú: Implementar → Nueva implementación
//    - Tipo: Aplicación web
//    - Ejecutar como: Yo (tu cuenta Gmail)
//    - Quién tiene acceso: Cualquier usuario
// 5. Copiá la URL que te da (termina en /exec)
// 6. Seteala en Supabase:
//    supabase secrets set GMAIL_WEBHOOK_URL=TU_URL_DE_EXEC

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Validar que viene un token secreto (evita que cualquiera mande emails)
    var expectedToken = "ova_email_secret_2026";
    if (data.token !== expectedToken) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Enviar el email usando Gmail
    MailApp.sendEmail({
      to: data.to || "ovavision.ve@gmail.com",
      subject: data.subject || "Notificación del Bot",
      htmlBody: data.html || data.body || "",
      name: "Bot OVA VISION"
    });

    Logger.log("Email enviado a " + data.to + " - " + data.subject);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("Error: " + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Para testear manualmente desde el editor
function testEmail() {
  var fakeRequest = {
    postData: {
      contents: JSON.stringify({
        token: "ova_email_secret_2026",
        to: "ovavision.ve@gmail.com",
        subject: "Prueba desde Apps Script",
        html: "<h1>Hola!</h1><p>Este es un email de prueba del bot.</p>"
      })
    }
  };
  var res = doPost(fakeRequest);
  Logger.log(res.getContent());
}
