// Lee propiedades desde Google Sheets (publicado como CSV)
// Luis edita el Sheet y el bot siempre tiene la info actualizada.

interface Propiedad {
  nombre: string
  direccion: string
  habitaciones: string
  banos: string
  precio: string
  fees: string
  fees_incluye: string
  parking: string
  promociones: string
  notas: string
  disponible: string
  foto_url: string
  video_url: string
}

// Cache por tenant (sheetId) para no pedir el Sheet en cada mensaje
const cacheMap: Map<string, { data: Propiedad[]; timestamp: number }> = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

function parsearCSV(csv: string): Propiedad[] {
  const lineas = csv.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)

  if (lineas.length < 2) return [] // solo header o vacío

  const propiedades: Propiedad[] = []

  for (let i = 1; i < lineas.length; i++) {
    // Parsear CSV respetando comillas
    const campos = parsearLineaCSV(lineas[i])
    if (campos.length < 11) continue

    const prop: Propiedad = {
      nombre: campos[0],
      direccion: campos[1],
      habitaciones: campos[2],
      banos: campos[3],
      precio: campos[4],
      fees: campos[5],
      fees_incluye: campos[6],
      parking: campos[7],
      promociones: campos[8],
      notas: campos[9],
      disponible: campos[10],
      foto_url: campos[11] || "",
      video_url: campos[12] || "",
    }

    // Solo incluir propiedades marcadas como disponibles
    if (prop.disponible.toLowerCase().startsWith("s") || prop.disponible.toLowerCase() === "yes") {
      propiedades.push(prop)
    }
  }

  return propiedades
}

function parsearLineaCSV(linea: string): string[] {
  const campos: string[] = []
  let campo = ""
  let dentroComillas = false

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]

    if (c === '"') {
      dentroComillas = !dentroComillas
    } else if (c === "," && !dentroComillas) {
      campos.push(campo.trim())
      campo = ""
    } else {
      campo += c
    }
  }

  campos.push(campo.trim())
  return campos
}

export async function obtenerPropiedades(sheetId?: string | null): Promise<Propiedad[]> {
  // Fallback a env var si no se pasa sheetId (compatibilidad)
  const id = sheetId || Deno.env.get("GOOGLE_SHEET_ID")

  if (!id) {
    console.warn("[sheets] No hay GOOGLE_SHEET_ID (tenant ni env)")
    return []
  }

  // Cache por sheetId
  const cached = cacheMap.get(id)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  try {
    const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`
    const res = await fetch(url)

    if (!res.ok) {
      console.error("[sheets] Error descargando Sheet:", res.status)
      return cached?.data || []
    }

    const csv = await res.text()
    const propiedades = parsearCSV(csv)

    console.log(`[sheets] Propiedades cargadas (sheet=${id.substring(0, 8)}...):`, propiedades.length)

    cacheMap.set(id, { data: propiedades, timestamp: Date.now() })

    return propiedades
  } catch (err) {
    console.error("[sheets] Error leyendo Sheet:", err)
    return cached?.data || []
  }
}

// Formatea las propiedades en 2 secciones: básica (siempre visible) + detalles (solo si preguntan)
export function formatearPropiedadesParaPrompt(propiedades: Propiedad[]): string {
  if (propiedades.length === 0) return "No hay propiedades disponibles."

  let basica = "LISTA DE PROPIEDADES (presentá SOLO esto al lead):\n"
  let detalles = "\nDETALLES DE CADA PROPIEDAD (SOLO compartir si el lead PREGUNTA por fees, parking o detalles):\n"

  for (const p of propiedades) {
    // Sección básica: solo nombre + dirección + precio
    basica += `- ${p.nombre}: ${p.direccion}`
    if (p.habitaciones && p.banos) basica += ` (${p.habitaciones}BR/${p.banos}BA)`
    if (p.precio) basica += ` — $${p.precio}/mes`
    basica += "\n"

    // Sección detalles: fees, parking, promos, notas (SOLO si preguntan)
    const detLines: string[] = []
    if (p.fees) detLines.push("Fees: $" + p.fees + (p.fees_incluye ? " (" + p.fees_incluye + ")" : ""))
    if (p.parking) detLines.push("Parking: " + p.parking)
    if (p.promociones) detLines.push("Promo: " + p.promociones)
    if (p.notas) detLines.push("Nota: " + p.notas)
    if (detLines.length > 0) {
      detalles += `${p.nombre}: ${detLines.join(". ")}\n`
    }
  }

  return basica + detalles
}
