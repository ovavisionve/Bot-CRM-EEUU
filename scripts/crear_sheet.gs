// Google Apps Script — Crear hoja de propiedades para el Bot de Instagram
//
// CÓMO USAR:
// 1. Abrí https://script.google.com
// 2. Clic en "Nuevo proyecto"
// 3. Borrá todo el código que aparece
// 4. Pegá este script completo
// 5. Clic en "Ejecutar" (botón ▶)
// 6. La primera vez te pide permisos — aceptá todo
// 7. Se crea el Sheet automáticamente y se abre en una pestaña nueva

function crearHojaPropiedades() {
  // Crear spreadsheet nuevo
  var ss = SpreadsheetApp.create("Bot Instagram — Propiedades Luis Almario");
  var sheet = ss.getActiveSheet();
  sheet.setName("Propiedades");

  // Headers (fila 1)
  var headers = [
    "Nombre",
    "Dirección",
    "Habitaciones",
    "Baños",
    "Precio",
    "Fees",
    "Fees Incluye",
    "Parking",
    "Promociones",
    "Notas",
    "Disponible"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Estilo de headers
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#1a73e8");
  headerRange.setFontColor("#ffffff");
  headerRange.setHorizontalAlignment("center");

  // Datos de ejemplo (propiedades de Luis)
  var datos = [
    [
      "Principal 2BR/2BA",
      "2901 SW 69th Court, Miami FL 33155",
      "2",
      "2",
      "2850",
      "70",
      "Internet, trash, amenities, pest control",
      "$25 first, second FREE this month",
      "2do parking GRATIS este mes",
      "Edificio nuevo, abrió en diciembre",
      "Sí"
    ],
    [
      "Principal 1BR/1BA",
      "3140 SW 69th Ave Unit A, Miami FL 33155",
      "1",
      "1",
      "2090",
      "70",
      "Internet, trash, amenities, pest control",
      "$25",
      "2do parking GRATIS este mes",
      "Coral Terrace West",
      "Sí"
    ],
    [
      "Alternativa económica",
      "3830 NW 11th St, Miami FL 33126",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Ofrecer cuando el lead dice que el precio está fuera de presupuesto",
      "Sí"
    ],
    [
      "Premium Alexan",
      "Alexan Ludlam Trace area, Miami",
      "",
      "",
      "3000",
      "",
      "",
      "",
      "Specials disponibles",
      "Zona premium, ~$3000/mes con specials y fees",
      "Sí"
    ]
  ];
  sheet.getRange(2, 1, datos.length, headers.length).setValues(datos);

  // Ajustar anchos de columna
  sheet.setColumnWidth(1, 180);  // Nombre
  sheet.setColumnWidth(2, 300);  // Dirección
  sheet.setColumnWidth(3, 110);  // Habitaciones
  sheet.setColumnWidth(4, 80);   // Baños
  sheet.setColumnWidth(5, 90);   // Precio
  sheet.setColumnWidth(6, 70);   // Fees
  sheet.setColumnWidth(7, 280);  // Fees Incluye
  sheet.setColumnWidth(8, 220);  // Parking
  sheet.setColumnWidth(9, 220);  // Promociones
  sheet.setColumnWidth(10, 350); // Notas
  sheet.setColumnWidth(11, 100); // Disponible

  // Dropdown de Sí/No en columna Disponible
  var disponibleRange = sheet.getRange(2, 11, 50, 1);
  var regla = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Sí", "No"])
    .setAllowInvalid(false)
    .build();
  disponibleRange.setDataValidation(regla);

  // Colores alternados en filas de datos
  for (var i = 2; i <= datos.length + 1; i++) {
    var fila = sheet.getRange(i, 1, 1, headers.length);
    if (i % 2 === 0) {
      fila.setBackground("#f8f9fa");
    }
  }

  // Bordes
  sheet.getRange(1, 1, datos.length + 1, headers.length)
    .setBorder(true, true, true, true, true, true);

  // Congelar header
  sheet.setFrozenRows(1);

  // Compartir como "Cualquier persona con el enlace puede ver"
  var file = DriveApp.getFileById(ss.getId());
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Mostrar resultado
  var url = ss.getUrl();
  var id = ss.getId();

  Logger.log("=== SHEET CREADO ===");
  Logger.log("URL: " + url);
  Logger.log("ID: " + id);
  Logger.log("Ya está compartido públicamente (solo lectura).");
  Logger.log("");
  Logger.log(">>> Copiá este ID para setear en Supabase:");
  Logger.log(">>> " + id);

  // Abrir el Sheet en una pestaña nueva
  SpreadsheetApp.setActiveSpreadsheet(ss);

  // Popup con el ID
  SpreadsheetApp.getUi().alert(
    "Sheet creado exitosamente!\n\n" +
    "ID del Sheet (copiá esto):\n" +
    id + "\n\n" +
    "Ya está compartido públicamente.\n" +
    "Ahora corré en PowerShell:\n\n" +
    "supabase secrets set GOOGLE_SHEET_ID=" + id
  );
}
