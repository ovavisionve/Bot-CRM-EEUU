// Google Apps Script - Webhook para sincronizar tours con Google Calendar
// VERSION 2 - Usa PropertiesService (sin Sheet externo)
//
// COMO USAR:
// 1. https://script.google.com -> Nuevo proyecto
// 2. Pega este codigo, guarda
// 3. Ejecuta testCalendar() una vez para autorizar permisos de Calendar
// 4. Implementar -> Nueva implementacion -> Aplicacion web
//    - Ejecutar como: Yo
//    - Quien tiene acceso: CUALQUIER USUARIO (importante)
// 5. Copia la URL /exec
// 6. supabase secrets set CALENDAR_WEBHOOK_URL=tu_url

var TOKEN = "ova_calendar_secret_2026";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) {
      return jsonResp({ ok: false, error: "Unauthorized" });
    }

    // Usar el calendario default del owner del script (no el del calendar_email)
    // porque CalendarApp.getCalendarById() requiere acceso explicito.
    var cal = CalendarApp.getDefaultCalendar();

    var props = PropertiesService.getScriptProperties();
    var key = "tour_" + data.tour_id;
    var existingEventId = props.getProperty(key);

    if (data.action === "delete") {
      if (existingEventId) {
        try {
          var ev = cal.getEventById(existingEventId);
          if (ev) ev.deleteEvent();
        } catch (err) { Logger.log("Delete failed: " + err); }
        props.deleteProperty(key);
      }
      return jsonResp({ ok: true, deleted: true });
    }

    var start = new Date(data.start);
    var end = new Date(start.getTime() + (data.duration_minutes || 30) * 60 * 1000);
    var title = data.title || "Tour";
    if (data.status === "cancelled") title = "[CANCELADO] " + title;
    if (data.status === "completed") title = "[REALIZADO] " + title;
    if (data.status === "no_show") title = "[NO ASISTIO] " + title;

    if (existingEventId) {
      try {
        var ev = cal.getEventById(existingEventId);
        if (ev) {
          ev.setTitle(title);
          ev.setTime(start, end);
          ev.setDescription(data.description || "");
          return jsonResp({ ok: true, updated: true, event_id: existingEventId });
        }
      } catch (err) {
        Logger.log("Update failed, creating new: " + err);
      }
    }

    var newEv = cal.createEvent(title, start, end, { description: data.description || "" });
    props.setProperty(key, newEv.getId());
    return jsonResp({ ok: true, created: true, event_id: newEv.getId() });

  } catch (err) {
    Logger.log("ERROR: " + err.toString());
    return jsonResp({ ok: false, error: err.toString() });
  }
}

function doGet(e) {
  return jsonResp({ ok: true, message: "OVA Calendar Webhook activo" });
}

function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Para autorizar permisos la primera vez
function testCalendar() {
  var cal = CalendarApp.getDefaultCalendar();
  Logger.log("Calendar OK: " + cal.getName());

  // Crear evento de prueba (lo borra al final)
  var testEv = cal.createEvent(
    "Test OVA - se borra solo",
    new Date(Date.now() + 60*60*1000),
    new Date(Date.now() + 90*60*1000),
    { description: "Evento de prueba creado por testCalendar()" }
  );
  Logger.log("Evento creado: " + testEv.getId());
  testEv.deleteEvent();
  Logger.log("Evento borrado. Todo OK.");
}
