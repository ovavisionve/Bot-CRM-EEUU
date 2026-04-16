// Google Apps Script — Webhook para sincronizar tours con Google Calendar
//
// CÓMO USAR:
// 1. https://script.google.com → Nuevo proyecto
// 2. Pegá este código completo, guardá
// 3. Implementar → Nueva implementación → Aplicación web
//    - Ejecutar como: Yo
//    - Quién tiene acceso: Cualquiera
// 4. Copiá la URL /exec
// 5. En Supabase: supabase secrets set CALENDAR_WEBHOOK_URL=tu_url_aca
// 6. Ejecutá testCalendar() una vez para autorizar permisos de Calendar
//
// El backend manda POSTs cuando se crea/actualiza un tour:
// { token, action: "upsert", tour_id, calendar_email, title, description,
//   start, duration_minutes, status }
//
// Para que se borre cuando status="cancelled", el backend manda action="delete".

var TOKEN = "ova_calendar_secret_2026";
var SHEET_ID = "1Z-4GBiEBqR7qRyahILkpMDuv48BDS5JLgTGi161lLXA"; // mismo Sheet de Luis (o uno aparte)

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) {
      return jsonResp({ ok: false, error: "Unauthorized" });
    }

    var calId = data.calendar_email || Session.getActiveUser().getEmail();
    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) cal = CalendarApp.getDefaultCalendar();

    var sheet = openMappingSheet();
    var existingEventId = lookupEventId(sheet, data.tour_id);

    if (data.action === "delete") {
      if (existingEventId) {
        try {
          var ev = cal.getEventById(existingEventId);
          if (ev) ev.deleteEvent();
        } catch (err) { Logger.log("Delete failed: " + err); }
        deleteMapping(sheet, data.tour_id);
      }
      return jsonResp({ ok: true, deleted: true });
    }

    // upsert
    var start = new Date(data.start);
    var end = new Date(start.getTime() + (data.duration_minutes || 30) * 60 * 1000);
    var title = data.title || "Tour";
    if (data.status === "cancelled") title = "[CANCELADO] " + title;
    if (data.status === "completed") title = "[REALIZADO] " + title;

    if (existingEventId) {
      var ev = cal.getEventById(existingEventId);
      if (ev) {
        ev.setTitle(title);
        ev.setTime(start, end);
        ev.setDescription(data.description || "");
        return jsonResp({ ok: true, updated: true, event_id: existingEventId });
      }
    }

    // crear nuevo
    var newEv = cal.createEvent(title, start, end, { description: data.description || "" });
    saveMapping(sheet, data.tour_id, newEv.getId());
    return jsonResp({ ok: true, created: true, event_id: newEv.getId() });

  } catch (err) {
    Logger.log("Error: " + err.toString());
    return jsonResp({ ok: false, error: err.toString() });
  }
}

function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function openMappingSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("CalendarMapping");
  if (!sheet) {
    sheet = ss.insertSheet("CalendarMapping");
    sheet.getRange(1, 1, 1, 2).setValues([["tour_id", "event_id"]]);
  }
  return sheet;
}

function lookupEventId(sheet, tourId) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(tourId)) return data[i][1];
  }
  return null;
}

function saveMapping(sheet, tourId, eventId) {
  sheet.appendRow([tourId, eventId]);
}

function deleteMapping(sheet, tourId) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(tourId)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

// Para autorizar permisos la primera vez
function testCalendar() {
  var cal = CalendarApp.getDefaultCalendar();
  Logger.log("Calendar OK: " + cal.getName());
}
