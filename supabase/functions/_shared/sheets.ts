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
}

// Cache para no pedir el Sheet en cada mensaje
let cache: { data: Propiedad[]; timestamp: number } | null = null
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

export async function obtenerPropiedades(): Promise<Propiedad[]> {
  // Revisar cache
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data
  }

  const sheetId = Deno.env.get("GOOGLE_SHEET_ID")

  if (!sheetId) {
    console.warn("[sheets] GOOGLE_SHEET_ID no configurado — usando propiedades vacías")
    return []
  }

  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`
    const res = await fetch(url)

    if (!res.ok) {
      console.error("[sheets] Error descargando Sheet:", res.status)
      return cache?.data || []
    }

    const csv = await res.text()
    const propiedades = parsearCSV(csv)

    console.log("[sheets] Propiedades cargadas:", propiedades.length)

    // Actualizar cache
    cache = { data: propiedades, timestamp: Date.now() }

    return propiedades
  } catch (err) {
    console.error("[sheets] Error leyendo Sheet:", err)
    return cache?.data || []
  }
}

// Formatea las propiedades para incluir en el prompt del bot
export function formatearPropiedadesParaPrompt(propiedades: Propiedad[]): string {
  if (propiedades.length === 0) {
    return "No hay propiedades disponibles en este momento."
  }

  return propiedades
    .map((p) => {
      let texto = `- ${p.nombre}: ${p.direccion}`
      if (p.habitaciones && p.banos) texto += ` (${p.habitaciones}BR/${p.banos}BA)`
      if (p.precio) texto += `\n  Price: $${p.precio}/mo`
      if (p.fees) texto += ` + $${p.fees} fees`
      if (p.fees_incluye) texto += ` (${p.fees_incluye})`
      if (p.parking) texto += `\n  Parking: ${p.parking}`
      if (p.promociones) texto += `\n  Promotion: ${p.promociones}`
      if (p.notas) texto += `\n  Notes: ${p.notas}`
      return texto
    })
    .join("\n\n")
}
