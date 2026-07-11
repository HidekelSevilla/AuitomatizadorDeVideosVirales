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

console.log("OK: seleccion de pestana estable al cambiar el foco");
