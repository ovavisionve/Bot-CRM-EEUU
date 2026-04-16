// Google Apps Script — Cargar 10 propiedades de prueba en el Sheet existente
//
// CÓMO USAR:
// 1. Abrí el Google Sheet que ya creaste (Bot Instagram — Propiedades Luis Almario)
// 2. Menú: Extensiones → Apps Script
// 3. Borrá todo el código que aparece
// 4. Pegá este script completo
// 5. Clic en "Ejecutar" (botón ▶)
// 6. Se cargan 10 propiedades de prueba en la hoja "Propiedades"

function cargarPropiedadesPrueba() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Propiedades");

  if (!sheet) {
    SpreadsheetApp.getUi().alert("No se encontró la hoja 'Propiedades'. Asegurate de que existe.");
    return;
  }

  // Limpiar datos existentes (mantener headers)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 11).clearContent();
  }

  var propiedades = [
    [
      "Coral Terrace 2BR/2BA",
      "2901 SW 69th Court, Miami FL 33155",
      "2", "2", "2850", "70",
      "Internet, trash, amenities, pest control",
      "$25 first, second FREE this month",
      "2do parking GRATIS este mes",
      "Edificio nuevo, abrió en diciembre. Unidades modernas con acabados de lujo.",
      "Sí"
    ],
    [
      "Coral Terrace West 1BR/1BA",
      "3140 SW 69th Ave Unit A, Miami FL 33155",
      "1", "1", "2090", "70",
      "Internet, trash, amenities, pest control",
      "$25",
      "2do parking GRATIS este mes",
      "Ideal para solteros o parejas. Misma zona que el principal.",
      "Sí"
    ],
    [
      "Flagami Budget 2BR/1BA",
      "3830 NW 11th St, Miami FL 33126",
      "2", "1", "2200", "50",
      "Trash, pest control",
      "$20",
      "Primer mes con 50% off en fees",
      "Opción económica. Ofrecer cuando el lead dice que el precio es alto.",
      "Sí"
    ],
    [
      "Alexan Ludlam Premium 2BR/2BA",
      "6880 SW 39th St, Miami FL 33155",
      "2", "2", "3000", "85",
      "Internet, trash, amenities, pest control, gym, pool",
      "$30 first, $30 second",
      "Specials disponibles — preguntar al manager",
      "Zona premium. Amenities de lujo: gym, pool, rooftop, coworking.",
      "Sí"
    ],
    [
      "Westchester Studio",
      "9301 SW 24th St, Miami FL 33165",
      "0", "1", "1650", "45",
      "Internet, trash",
      "$15",
      "Sin depósito para crédito 700+",
      "Studio amplio 550 sqft. Ideal para profesionales jóvenes. Pet friendly.",
      "Sí"
    ],
    [
      "Bird Road 3BR/2BA",
      "4520 SW 67th Ave, Miami FL 33155",
      "3", "2", "3400", "95",
      "Internet, trash, amenities, pest control, storage unit",
      "$35 first, second FREE",
      "Primer mes gratis con lease de 13 meses",
      "Ideal para familias. Cerca de escuelas. Unidad en piso 5 con vista.",
      "Sí"
    ],
    [
      "Doral Modern 1BR/1BA",
      "8200 NW 33rd St, Doral FL 33122",
      "1", "1", "2300", "60",
      "Internet, trash, amenities, valet trash",
      "$25",
      "Waived application fee this month",
      "Zona Doral. Cerca de Dolphin Mall y aeropuerto. Edificio 2025.",
      "Sí"
    ],
    [
      "Little Havana Renovated 2BR/1BA",
      "1245 SW 6th St, Miami FL 33135",
      "2", "1", "1950", "40",
      "Trash, pest control",
      "Free — street parking",
      "No deposit for credit 680+",
      "Recién renovado. Calle tranquila. Excelente precio para la zona.",
      "Sí"
    ],
    [
      "Kendall Family 3BR/2BA",
      "12005 SW 104th St, Miami FL 33186",
      "3", "2", "2900", "75",
      "Internet, trash, amenities, pest control, playground",
      "$25 first, second $25",
      "2 meses gratis con lease de 15 meses",
      "Comunidad familiar. Playground, pool, BBQ area. Cerca de Baptist Hospital.",
      "Sí"
    ],
    [
      "Brickell Tower 1BR/1BA",
      "1420 S Miami Ave, Miami FL 33130",
      "1", "1", "2750", "120",
      "Internet, trash, amenities, gym, pool, concierge, valet",
      "$50 (valet parking included)",
      "6 weeks free on 14-month lease",
      "Brickell luxury. Vista a la bahía piso 22. Walking distance a Brickell City Centre. NO DISPONIBLE hasta Julio.",
      "No"
    ]
  ];

  // Insertar datos
  sheet.getRange(2, 1, propiedades.length, 11).setValues(propiedades);

  // Estilos de filas alternas
  for (var i = 2; i <= propiedades.length + 1; i++) {
    var fila = sheet.getRange(i, 1, 1, 11);
    if (i % 2 === 0) {
      fila.setBackground("#f8f9fa");
    } else {
      fila.setBackground("#ffffff");
    }
  }

  // Dropdown Sí/No en columna Disponible
  var disponibleRange = sheet.getRange(2, 11, 50, 1);
  var regla = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Sí", "No"])
    .setAllowInvalid(false)
    .build();
  disponibleRange.setDataValidation(regla);

  // Bordes
  sheet.getRange(1, 1, propiedades.length + 1, 11)
    .setBorder(true, true, true, true, true, true);

  // Resumen
  var disponibles = propiedades.filter(function(p) { return p[10] === "Sí"; }).length;
  var noDisponibles = propiedades.length - disponibles;

  SpreadsheetApp.getUi().alert(
    "Propiedades cargadas!\n\n" +
    "Total: " + propiedades.length + "\n" +
    "Disponibles: " + disponibles + "\n" +
    "No disponibles: " + noDisponibles + "\n\n" +
    "Rango de precios: $1,650 - $3,400/mes\n" +
    "Tipos: Studio, 1BR, 2BR, 3BR\n" +
    "Zonas: Coral Terrace, Flagami, Westchester, Bird Road, Doral, Little Havana, Kendall, Brickell"
  );
}
