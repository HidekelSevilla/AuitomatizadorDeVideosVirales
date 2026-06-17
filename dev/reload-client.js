// dev/reload-client.js
// Cliente de auto-reload (SOLO desarrollo). Lo importa dinamicamente el service worker
// cuando la extension corre descomprimida (ver isDev en service-worker.js).
// Conecta al dev-server y, al recibir "reload", recarga la pestana de Flow y la extension.

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
      await reloadFlowTabs();
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

// Recarga las pestanas de Flow para que reciban el content script nuevo tras el reload.
async function reloadFlowTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://labs.google/*" });
    await Promise.all(tabs.map((t) => chrome.tabs.reload(t.id)));
  } catch {
    // sin permiso o sin pestanas: ignorar
  }
}
