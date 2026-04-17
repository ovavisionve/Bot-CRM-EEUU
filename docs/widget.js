// OVA REAL - Widget embebible para el sitio del cliente
//
// Uso: pegá esto en el <head> o <body> del sitio del cliente:
//   <script src="https://ovavisionve.github.io/Bot-CRM-EEUU/widget.js"
//           data-token="ova_XXXXXXXXXXXX"
//           data-brand-color="#1877f2"
//           data-agent-name="Luis"></script>
//
// Crea un chat flotante en la esquina inferior derecha.
// Los mensajes se envian como leads nuevos a la API publica del tenant.

(function() {
  var script = document.currentScript
  var token = script.getAttribute("data-token")
  var brandColor = script.getAttribute("data-brand-color") || "#1877f2"
  var agentName = script.getAttribute("data-agent-name") || "Agente"
  var API = "https://vrfydffwczomvuoigwsm.supabase.co/functions/v1/public-api"

  if (!token) {
    console.error("[OVA Widget] Falta data-token")
    return
  }

  // Inyectar estilos
  var style = document.createElement("style")
  style.textContent = [
    "#ova-widget-btn {",
    "  position: fixed; bottom: 24px; right: 24px; width: 60px; height: 60px;",
    "  border-radius: 50%; background: " + brandColor + "; color: white;",
    "  display: flex; align-items: center; justify-content: center;",
    "  cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2);",
    "  z-index: 999999; border: none; font-size: 26px;",
    "  transition: transform 0.15s;",
    "}",
    "#ova-widget-btn:hover { transform: scale(1.08); }",
    "#ova-widget-box {",
    "  position: fixed; bottom: 100px; right: 24px;",
    "  width: 340px; max-height: 520px; background: white;",
    "  border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,0.18);",
    "  display: none; flex-direction: column; overflow: hidden; z-index: 999999;",
    "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "}",
    "#ova-widget-box.open { display: flex; }",
    "#ova-widget-header {",
    "  background: " + brandColor + "; color: white; padding: 16px 18px;",
    "}",
    "#ova-widget-header h3 { margin: 0; font-size: 16px; font-weight: 600; }",
    "#ova-widget-header p { margin: 2px 0 0; font-size: 12px; opacity: 0.9; }",
    "#ova-widget-body { padding: 16px; flex: 1; overflow-y: auto; min-height: 120px; }",
    "#ova-widget-form label { display: block; font-size: 12px; color: #65676b; margin: 8px 0 4px; }",
    "#ova-widget-form input, #ova-widget-form textarea {",
    "  width: 100%; padding: 9px 11px; border: 1px solid #dddfe2;",
    "  border-radius: 6px; font-size: 13px; box-sizing: border-box;",
    "  font-family: inherit;",
    "}",
    "#ova-widget-form input:focus, #ova-widget-form textarea:focus {",
    "  outline: none; border-color: " + brandColor + ";",
    "}",
    "#ova-widget-send {",
    "  width: 100%; padding: 11px; background: " + brandColor + "; color: white;",
    "  border: none; border-radius: 8px; font-weight: 600; margin-top: 14px;",
    "  cursor: pointer; font-size: 14px;",
    "}",
    "#ova-widget-send:disabled { opacity: 0.6; cursor: not-allowed; }",
    "#ova-widget-success {",
    "  text-align: center; padding: 20px; color: #1c1e21;",
    "}",
    "#ova-widget-success .icon {",
    "  width: 52px; height: 52px; background: #42b72a; border-radius: 50%;",
    "  color: white; display: inline-flex; align-items: center;",
    "  justify-content: center; font-size: 26px; margin-bottom: 10px;",
    "}",
  ].join("\n")
  document.head.appendChild(style)

  // Botón flotante
  var btn = document.createElement("button")
  btn.id = "ova-widget-btn"
  btn.innerHTML = "\ud83d\udcac"
  btn.setAttribute("aria-label", "Abrir chat")

  // Caja del chat
  var box = document.createElement("div")
  box.id = "ova-widget-box"
  box.innerHTML =
    '<div id="ova-widget-header">' +
      '<h3>Hola!</h3>' +
      '<p>Dejanos tus datos y te contactamos al instante</p>' +
    '</div>' +
    '<div id="ova-widget-body">' +
      '<form id="ova-widget-form">' +
        '<label>Nombre *</label><input name="name" required placeholder="Tu nombre" />' +
        '<label>Email</label><input name="email" type="email" placeholder="tu@email.com" />' +
        '<label>Telefono / WhatsApp *</label><input name="phone" required placeholder="+1 786..." />' +
        '<label>Mensaje</label><textarea name="notes" rows="3" placeholder="En que podemos ayudarte?"></textarea>' +
        '<button type="submit" id="ova-widget-send">Enviar</button>' +
      '</form>' +
      '<div id="ova-widget-success" style="display:none;">' +
        '<div class="icon">\u2713</div>' +
        '<h3 style="margin:0 0 6px;">Listo!</h3>' +
        '<p style="margin:0;color:#65676b;font-size:13px;">Te vamos a contactar en breve.</p>' +
      '</div>' +
    '</div>'

  document.body.appendChild(btn)
  document.body.appendChild(box)

  btn.addEventListener("click", function() { box.classList.toggle("open") })

  // Submit del form
  box.querySelector("#ova-widget-form").addEventListener("submit", function(e) {
    e.preventDefault()
    var form = e.target
    var sendBtn = form.querySelector("#ova-widget-send")
    sendBtn.disabled = true
    sendBtn.textContent = "Enviando..."

    var data = {
      name: form.name.value.trim(),
      email: form.email.value.trim() || null,
      phone: form.phone.value.trim(),
      notes: form.notes.value.trim() || null,
      source: "website_widget",
      language: (navigator.language || "en").slice(0, 2) === "es" ? "es" : "en",
    }

    fetch(API + "/leads", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then(function(r) { return r.json().then(function(j) { return { status: r.status, body: j } }) })
      .then(function(res) {
        if (res.status < 300) {
          form.style.display = "none"
          box.querySelector("#ova-widget-success").style.display = "block"
          setTimeout(function() {
            box.classList.remove("open")
          }, 3000)
        } else {
          alert("Error: " + (res.body.error || "No se pudo enviar"))
          sendBtn.disabled = false
          sendBtn.textContent = "Enviar"
        }
      })
      .catch(function(err) {
        alert("Error de red: " + err.message)
        sendBtn.disabled = false
        sendBtn.textContent = "Enviar"
      })
  })
})();
