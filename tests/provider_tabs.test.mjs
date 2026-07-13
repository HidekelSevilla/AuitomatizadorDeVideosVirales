import assert from "node:assert/strict";
import { chooseProviderTab } from "../lib/provider-tabs.js";

const tabs = [
  { id: 10, active: false, url: "https://grok.com/imagine/post/a" },
  { id: 20, active: true, url: "https://grok.com/imagine" },
  { id: 30, active: false, url: "https://grok.com/" },
];

assert.equal(chooseProviderTab(tabs, "grok")?.id, 20, "la primera seleccion prefiere Imagine activa");

const changedFocus = tabs.map((tab) => ({ ...tab, active: tab.id === 10 }));
assert.equal(
  chooseProviderTab(changedFocus, "grok", 20)?.id,
  20,
  "cambiar de ventana no debe mover una corrida a otra pestana de Grok",
);

assert.equal(chooseProviderTab(changedFocus, "grok", 999)?.id, 10, "si la anclada cerro, elige una Imagine valida");
assert.equal(chooseProviderTab([], "grok", 20), null);

const flowTabs = [
  { id: 40, active: true, url: "https://labs.google/fx/es/tools/flow/project/proyecto-equivocado" },
  { id: 50, active: false, url: "https://labs.google/fx/es/tools/flow/project/serie-p2" },
];
assert.equal(chooseProviderTab(flowTabs, "flow", 40, "serie-p2")?.id, 50,
  "la asociacion persistida de la serie debe ganar al foco y al id volatil");
const mixedLabs = [
  { id: 60, active: true, url: "https://labs.google/fx/es/tools/whisk/project/foo" },
  { id: 70, active: false, url: "https://labs.google/fx/es/tools/flow/project/bar" },
];
assert.equal(chooseProviderTab(mixedLabs, "flow")?.id, 70,
  "Whisk/ImageFX no pueden elegirse como si fueran Flow");
assert.equal(chooseProviderTab([mixedLabs[0]], "flow"), null, "sin una URL /tools/flow no hay tab Flow valido");

console.log("OK: seleccion de pestana estable al cambiar el foco");
