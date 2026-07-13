// Seleccion estable de pestana por proveedor. Una vez que una corrida eligio su pestana,
// cambiar el foco a otra ventana no debe mover la automatizacion a otra instancia de Grok/Flow.
export function chooseProviderTab(tabs, provider, preferredId = null, expectedProjectId = null) {
  let list = Array.isArray(tabs) ? tabs.filter(Boolean) : [];
  if (provider === "flow") list = list.filter((tab) => /\/tools\/flow(?:\/|$)/.test(tab.url || ""));
  if (!list.length) return null;

  if (provider === "flow" && expectedProjectId) {
    const associated = list.find((tab) => String(tab.url || "").includes(`/flow/project/${expectedProjectId}`));
    if (associated) return associated;
  }

  if (preferredId != null) {
    const preferred = list.find((tab) => tab.id === preferredId);
    if (preferred) return preferred;
  }

  if (provider === "grok") {
    const imagine = list.filter((tab) => /grok\.com\/imagine/.test(tab.url || ""));
    if (imagine.length) return imagine.find((tab) => tab.active) || imagine[0];
  }

  return list.find((tab) => tab.active) || list[0] || null;
}
