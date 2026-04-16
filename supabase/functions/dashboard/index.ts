// Dashboard — Mini CRM para ver leads y conversaciones
// URL: https://vrfydffwczomvuoigwsm.supabase.co/functions/v1/dashboard

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const selectedSender = url.searchParams.get("lead")
  const supabase = getClient()

  // Obtener todos los leads
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("updated_at", { ascending: false })

  // Si hay un lead seleccionado, obtener su conversación
  let conversacion: any[] = []
  let leadActivo: any = null

  if (selectedSender) {
    leadActivo = leads?.find((l: any) => l.sender_id === selectedSender) || null

    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("sender_id", selectedSender)
      .order("created_at", { ascending: true })

    conversacion = data || []
  }

  const html = renderHTML(leads || [], conversacion, leadActivo, selectedSender)

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
})

function renderHTML(leads: any[], conversacion: any[], leadActivo: any, selectedSender: string | null): string {
  const leadsHTML = leads.map((lead: any) => {
    const isActive = lead.sender_id === selectedSender
    const msgCount = lead.status || "new"
    const timeAgo = getTimeAgo(lead.updated_at || lead.created_at)

    return `
      <a href="?lead=${lead.sender_id}" class="lead-item ${isActive ? "active" : ""}">
        <div class="lead-avatar">${(lead.name || lead.sender_id).charAt(0).toUpperCase()}</div>
        <div class="lead-info">
          <div class="lead-name">${escapeHtml(lead.name || "Lead " + lead.sender_id)}</div>
          <div class="lead-meta">
            <span class="status-badge status-${msgCount}">${msgCount}</span>
            <span class="lead-time">${timeAgo}</span>
          </div>
        </div>
      </a>
    `
  }).join("")

  const chatHTML = conversacion.map((msg: any) => {
    const isInbound = msg.direction === "inbound"
    const time = new Date(msg.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })

    return `
      <div class="message ${isInbound ? "inbound" : "outbound"}">
        <div class="bubble">
          ${escapeHtml(msg.message_text)}
          <span class="msg-time">${time}</span>
        </div>
      </div>
    `
  }).join("")

  const leadDetailHTML = leadActivo ? `
    <div class="lead-detail-bar">
      <div class="detail-item"><strong>ID:</strong> ${escapeHtml(leadActivo.sender_id)}</div>
      ${leadActivo.name ? `<div class="detail-item"><strong>Nombre:</strong> ${escapeHtml(leadActivo.name)}</div>` : ""}
      <div class="detail-item"><strong>Status:</strong> <span class="status-badge status-${leadActivo.status}">${leadActivo.status}</span></div>
      <div class="detail-item"><strong>Idioma:</strong> ${leadActivo.language || "en"}</div>
      ${leadActivo.credit_score ? `<div class="detail-item"><strong>Crédito:</strong> ${leadActivo.credit_score}</div>` : ""}
      ${leadActivo.pets ? `<div class="detail-item"><strong>Mascotas:</strong> ${leadActivo.pets}</div>` : ""}
      ${leadActivo.occupants ? `<div class="detail-item"><strong>Ocupantes:</strong> ${leadActivo.occupants}</div>` : ""}
      ${leadActivo.tour_date ? `<div class="detail-item"><strong>Tour:</strong> ${leadActivo.tour_date}</div>` : ""}
      <div class="detail-item"><strong>Mensajes:</strong> ${conversacion.length}</div>
    </div>
  ` : ""

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OVA REAL — Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      height: 100vh;
      overflow: hidden;
    }

    .app {
      display: flex;
      height: 100vh;
    }

    /* ─── Sidebar ─── */
    .sidebar {
      width: 320px;
      border-right: 1px solid #2a2a2a;
      display: flex;
      flex-direction: column;
      background: #141414;
    }

    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid #2a2a2a;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sidebar-header h1 {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }

    .sidebar-header .logo {
      width: 32px;
      height: 32px;
      background: #6366f1;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: #fff;
    }

    .lead-count {
      padding: 12px 20px;
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #2a2a2a;
    }

    .leads-list {
      flex: 1;
      overflow-y: auto;
    }

    .lead-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      text-decoration: none;
      color: #e0e0e0;
      border-bottom: 1px solid #1e1e1e;
      transition: background 0.15s;
    }

    .lead-item:hover { background: #1e1e1e; }
    .lead-item.active { background: #1e1e3a; border-left: 3px solid #6366f1; }

    .lead-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #2a2a4a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 16px;
      color: #a5b4fc;
      flex-shrink: 0;
    }

    .lead-info { flex: 1; min-width: 0; }

    .lead-name {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lead-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }

    .lead-time { font-size: 11px; color: #666; }

    /* ─── Main ─── */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #0f0f0f;
    }

    .main-header {
      padding: 16px 24px;
      border-bottom: 1px solid #2a2a2a;
      background: #141414;
    }

    .main-header h2 {
      font-size: 16px;
      font-weight: 600;
    }

    .lead-detail-bar {
      padding: 12px 24px;
      background: #1a1a2e;
      border-bottom: 1px solid #2a2a2a;
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 13px;
    }

    .detail-item { display: flex; gap: 4px; align-items: center; }

    /* ─── Chat ─── */
    .chat {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .message {
      display: flex;
      max-width: 65%;
    }

    .message.inbound { align-self: flex-start; }
    .message.outbound { align-self: flex-end; }

    .bubble {
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
      position: relative;
    }

    .inbound .bubble {
      background: #2a2a2a;
      border-bottom-left-radius: 4px;
    }

    .outbound .bubble {
      background: #3730a3;
      color: #e0e7ff;
      border-bottom-right-radius: 4px;
    }

    .msg-time {
      display: block;
      font-size: 10px;
      color: #888;
      margin-top: 4px;
      text-align: right;
    }

    .outbound .msg-time { color: #a5b4fc; }

    /* ─── Empty State ─── */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #555;
    }

    .empty-state .icon { font-size: 48px; margin-bottom: 16px; }
    .empty-state p { font-size: 14px; }

    /* ─── Status Badges ─── */
    .status-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-new { background: #1e3a5f; color: #60a5fa; }
    .status-contacted { background: #3b2f1e; color: #fbbf24; }
    .status-qualified { background: #1e3b2f; color: #34d399; }
    .status-disqualified { background: #3b1e1e; color: #f87171; }
    .status-touring { background: #2e1e3b; color: #a78bfa; }
    .status-tour_confirmed { background: #1e3b2f; color: #34d399; }
    .status-closed_won { background: #1e3b1e; color: #4ade80; }

    /* ─── Scrollbar ─── */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #555; }

    /* ─── Responsive ─── */
    @media (max-width: 768px) {
      .sidebar { width: 100%; }
      .main { display: ${selectedSender ? "flex" : "none"}; }
      .sidebar { display: ${selectedSender ? "none" : "flex"}; }
      ${selectedSender ? `.main-header::before { content: "< Volver"; cursor: pointer; margin-right: 12px; }` : ""}
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="logo">OR</div>
        <h1>OVA REAL</h1>
      </div>
      <div class="lead-count">Leads (${leads.length})</div>
      <div class="leads-list">
        ${leadsHTML || '<div class="empty-state"><p>No hay leads aún</p></div>'}
      </div>
    </div>

    <div class="main">
      ${selectedSender && leadActivo ? `
        <div class="main-header">
          <h2>${escapeHtml(leadActivo.name || "Lead " + leadActivo.sender_id)}</h2>
        </div>
        ${leadDetailHTML}
        <div class="chat">
          ${chatHTML || '<div class="empty-state"><p>Sin mensajes</p></div>'}
        </div>
      ` : `
        <div class="empty-state">
          <div class="icon">💬</div>
          <p>Seleccioná un lead para ver la conversación</p>
        </div>
      `}
    </div>
  </div>

  ${selectedSender ? `
  <script>
    // Auto-scroll al último mensaje
    const chat = document.querySelector('.chat');
    if (chat) chat.scrollTop = chat.scrollHeight;

    // Auto-refresh cada 10 segundos
    setTimeout(() => location.reload(), 10000);
  </script>
  ` : ""}
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "ahora"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
