// OVA REAL - Service Worker (PWA + Push Notifications)
var CACHE_NAME = "ova-real-v1"
var URLS_TO_CACHE = [
  "/Bot-CRM-EEUU/login.html",
  "/Bot-CRM-EEUU/dashboard.html",
  "/Bot-CRM-EEUU/admin.html",
  "/Bot-CRM-EEUU/manifest.json",
  "/Bot-CRM-EEUU/icon-192.svg",
]

// Install: cachear archivos estáticos
self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_TO_CACHE)
    })
  )
  self.skipWaiting()
})

// Activate: limpiar caches viejos
self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME })
          .map(function(n) { return caches.delete(n) })
      )
    })
  )
  self.clients.claim()
})

// Fetch: network-first, fallback a cache
self.addEventListener("fetch", function(event) {
  // Solo cachear mismos origenes y paginas HTML
  if (!event.request.url.includes("/Bot-CRM-EEUU/")) return
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Guardar en cache la respuesta fresca
        if (response.status === 200) {
          var clone = response.clone()
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone)
          })
        }
        return response
      })
      .catch(function() {
        return caches.match(event.request)
      })
  )
})

// Push notification recibida
self.addEventListener("push", function(event) {
  var data = {}
  try { data = event.data.json() } catch (e) {
    data = { title: "OVA REAL", body: event.data ? event.data.text() : "Nuevo evento" }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "OVA REAL", {
      body: data.body || "",
      icon: "/Bot-CRM-EEUU/icon-192.svg",
      badge: "/Bot-CRM-EEUU/icon-192.svg",
      tag: data.tag || "ova-notification",
      data: { url: data.url || "/Bot-CRM-EEUU/dashboard.html" },
      vibrate: [200, 100, 200],
      requireInteraction: data.requireInteraction || false,
    })
  )
})

// Click en la notificación
self.addEventListener("notificationclick", function(event) {
  event.notification.close()
  var url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/Bot-CRM-EEUU/dashboard.html"
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list) {
      for (var c of list) {
        if (c.url.includes("Bot-CRM-EEUU") && "focus" in c) return c.focus()
      }
      return clients.openWindow(url)
    })
  )
})
