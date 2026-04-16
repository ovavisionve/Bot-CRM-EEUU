// Lead scoring 0-100 basado en 5 factores:
// crédito (30) + timeline (25) + presupuesto (20) + engagement (15) + fuente (10)

export interface ScoringFactors {
  credit: number
  timeline: number
  budget: number
  engagement: number
  source: number
}

export function calculateScore(lead: any, messageCount = 0, maxPropertyPrice = 3000): {
  score: number
  factors: ScoringFactors
} {
  const factors: ScoringFactors = {
    credit: 0,
    timeline: 0,
    budget: 0,
    engagement: 0,
    source: 0,
  }

  // 1. Crédito (30 pts)
  const cs = lead.credit_score
  if (cs >= 750) factors.credit = 30
  else if (cs >= 680) factors.credit = 20
  else if (cs >= 620) factors.credit = 10
  else if (cs !== null && cs !== undefined && cs < 620) factors.credit = 0
  else factors.credit = 5 // unknown, neutral

  // 2. Timeline (25 pts) - intentar parsear move_in_date
  const days = getDaysUntilMove(lead.move_in_date)
  if (days !== null) {
    if (days <= 30) factors.timeline = 25
    else if (days <= 60) factors.timeline = 18
    else if (days <= 90) factors.timeline = 12
    else factors.timeline = 6
  } else {
    factors.timeline = 8 // no info
  }

  // 3. Presupuesto (20 pts)
  const budget = lead.budget_max
  if (budget && budget >= maxPropertyPrice) factors.budget = 20
  else if (budget && budget >= maxPropertyPrice * 0.8) factors.budget = 14
  else if (budget && budget >= maxPropertyPrice * 0.6) factors.budget = 8
  else if (!budget) factors.budget = 10 // unknown, neutral
  else factors.budget = 4

  // 4. Engagement (15 pts) - basado en cantidad de mensajes
  if (messageCount >= 15) factors.engagement = 15
  else if (messageCount >= 10) factors.engagement = 12
  else if (messageCount >= 5) factors.engagement = 8
  else if (messageCount >= 2) factors.engagement = 4
  else factors.engagement = 1

  // 5. Fuente (10 pts)
  const src = (lead.source || "").toLowerCase()
  if (src === "referral") factors.source = 10
  else if (src === "instagram") factors.source = 7
  else if (src === "web" || src === "zillow") factors.source = 6
  else if (src === "sms") factors.source = 7
  else factors.source = 5

  // Bonus por status favorable
  if (lead.status === "tour_confirmed") factors.engagement = Math.min(15, factors.engagement + 3)
  if (lead.status === "touring") factors.engagement = Math.min(15, factors.engagement + 2)

  const score = Math.min(100, Math.max(0,
    factors.credit + factors.timeline + factors.budget + factors.engagement + factors.source
  ))

  return { score, factors }
}

function getDaysUntilMove(moveInDate?: string | null): number | null {
  if (!moveInDate) return null
  const now = new Date()
  // Intentar parsear fecha directa
  const direct = Date.parse(moveInDate)
  if (!isNaN(direct)) {
    return Math.round((direct - now.getTime()) / (1000 * 60 * 60 * 24))
  }
  // Heurística: palabras como "next week", "asap", "december", etc.
  const low = moveInDate.toLowerCase()
  if (/asap|ya|urgente|pronto|immediately|now/.test(low)) return 7
  if (/next week|proxima semana/.test(low)) return 14
  if (/next month|mes que viene|proximo mes/.test(low)) return 45
  // Meses en inglés/español
  const monthsEn = ["january","february","march","april","may","june","july","august","september","october","november","december"]
  const monthsEs = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]
  for (let i = 0; i < 12; i++) {
    if (low.includes(monthsEn[i]) || low.includes(monthsEs[i])) {
      const y = now.getFullYear()
      let target = new Date(y, i, 1)
      if (target < now) target = new Date(y + 1, i, 1)
      return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }
  }
  return null
}
