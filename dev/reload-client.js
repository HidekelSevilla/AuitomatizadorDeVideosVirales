// dev/reload-client.js
// Cliente de auto-reload (SOLO desarrollo). Lo importa dinamicamente el service worker
// cuando la extension corre descomprimida (ver isDev en service-worker.js).
// Conecta al dev-server y, al recibir "reload", recarga las pestanas de proveedores y la extension.

const WS_URL = "ws://localhost:35729";
let backoff = 1000;

export function startDevReload() {
  connect();
  console.log("[dev-reload] cliente activo (esperando dev-server en " + WS_URL + ")");
}

function connect() {
  let ws;
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    return retry();
  }

  ws.onopen = () => {
    backoff = 1000;
    console.log("[dev-reload] conectado al dev-server");
  };

  ws.onmessage = async (e) => {
    if (e.data === "reload") {
      console.log("[dev-reload] cambio detectado -> recargando");
      await reloadProviderTabs();
      chrome.runtime.reload();
    }
    // "ping" solo sirve de heartbeat para mantener vivo el SW; no hacemos nada.
  };

  ws.onclose = () => retry();
  ws.onerror = () => { try { ws.close(); } catch {} };
}

function retry() {
  setTimeout(connect, backoff);
  backoff = Math.min(Math.round(backoff * 1.5), 10000);
}

// Los scripts de Grok se inyectan bajo demanda (no aparecen en manifest.content_scripts). Si solo
// recargamos la extension, una pestana de Grok abierta puede conservar el mundo aislado anterior y
// seguir ejecutando un detector viejo hasta la proxima navegacion. Recargar ambos proveedores hace
// que una correccion de driver entre realmente en uso durante desarrollo.
async function reloadProviderTabs() {
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://labs.google/*", "https://grok.com/*"],
    });
    await Promise.all(tabs.map((t) => chrome.tabs.reload(t.id)));
  } catch {
    // sin permiso o sin pestanas: ignorar
  }
}
