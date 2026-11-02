/*
 * Service worker: deixa o app abrir sem internet depois da primeira visita.
 * Guarda só os arquivos do próprio app (HTML, JS, CSS e ícones). NUNCA guarda dados financeiros:
 * eles ficam no IndexedDB, e este arquivo não faz nenhuma chamada a outros servidores.
 * O marcador da constante BUILD é trocado a cada build (vite.config.ts), então o navegador detecta a atualização.
 */
const BUILD = 'mvwjxq64'
const PREFIX = 'maf-'
const CACHE = PREFIX + BUILD

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope
      const indexUrl = new URL('index.html', scope).href
      const html = await (await fetch(indexUrl, { cache: 'no-cache' })).text()
      // Tudo o que o index.html referencia (JS, CSS, manifesto, ícones) entra no cache.
      const referenced = [...html.matchAll(/(?:src|href)="([^"#?]+)"/g)]
        .map((m) => m[1])
        .filter((url) => !/^(?:[a-z]+:)?\/\//i.test(url))
        .map((url) => new URL(url, scope).href)
      const files = new Set([scope, indexUrl, new URL('manifest.webmanifest', scope).href, ...referenced])
      const cache = await caches.open(CACHE)
      await cache.addAll([...files])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // Online: sempre a versão mais nova. Offline: a cópia guardada.
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true })) ??
          Response.error(),
      ),
    )
    return
  }

  // Arquivos do app têm nome com hash: o que está no cache nunca fica desatualizado.
  // Busca pela URL e ignora o cabeçalho Vary: com o objeto da requisição, o JS e o CSS não eram achados.
  event.respondWith(
    caches.match(request.url, { ignoreVary: true }).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
