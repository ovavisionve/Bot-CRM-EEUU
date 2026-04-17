// Google Apps Script — Agregar columnas Foto URL y Video URL al Sheet de propiedades
//
// COMO USAR:
// 1. Abri el Google Sheet de propiedades de Luis
// 2. Menu: Extensiones > Apps Script
// 3. Borra todo el codigo y pega esto
// 4. Ejecuta la funcion agregarColumnasMedia (boton ▶)
// 5. Listo! Las columnas L y M se agregan con headers y ejemplos

function agregarColumnasMedia() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Propiedades");

  if (!sheet) {
    SpreadsheetApp.getUi().alert("No se encontro la hoja 'Propiedades'");
    return;
  }

  // Headers en L1 y M1
  sheet.getRange("L1").setValue("Foto URL");
  sheet.getRange("M1").setValue("Video URL");

  // Estilo de headers (mismo que los demas)
  var headerRange = sheet.getRange("L1:M1");
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#1a73e8");
  headerRange.setFontColor("#ffffff");
  headerRange.setHorizontalAlignment("center");

  // Ancho de columnas
  sheet.setColumnWidth(12, 300); // L - Foto URL
  sheet.setColumnWidth(13, 300); // M - Video URL

  // Ejemplo en la primera propiedad (fila 2) como placeholder
  sheet.getRange("L2").setValue("https://ejemplo.com/foto-apartamento.jpg");
  sheet.getRange("L2").setFontColor("#999999");
  sheet.getRange("M2").setValue("https://ejemplo.com/video-tour.mp4");
  sheet.getRange("M2").setFontColor("#999999");

  // Bordes
  var lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(1, 12, lastRow, 2)
    .setBorder(true, true, true, true, true, true);

  SpreadsheetApp.getUi().alert(
    "¡Columnas agregadas!\n\n" +
    "Columna L: Foto URL\n" +
    "Columna M: Video URL\n\n" +
    "Pega links directos de imagenes (.jpg, .png) y videos (.mp4).\n" +
    "Los links deben ser publicos (Google Drive con sharing=anyone, Imgur, etc).\n\n" +
    "Cuando un lead pida fotos, el bot enviara automaticamente la foto de la propiedad seleccionada."
  );
}
