import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content/grok-driver.js", import.meta.url), "utf8");
const instrumentedSource = source.replace(/\}\)\(\);\s*$/, "globalThis.__grokTest = { imageDimensionsLookFinal };})();");

let messageListener = null;
const editable = { closest: () => form, innerText: "" };
const send = { getAttribute: (name) => name === "aria-label" ? "Enviar" : null, disabled: false };
const fileInput = { files: { length: 2 } };
const form = {
  contains: () => false,
  querySelector(selector) {
    if (selector.includes('input[type="file"]')) return fileInput;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "button,[role=button]") return [send];
    return [];
  },
};
let images = [];
const videos = [
  {
    currentSrc: "https://imagine-public.x.ai/imagine-public/share-videos/feed_hd.mp4",
    src: "https://imagine-public.x.ai/imagine-public/share-videos/feed_hd.mp4",
  },
  {
    currentSrc: "https://assets.grok.com/users/test/generated/post-123/generated_video.mp4",
    src: "https://assets.grok.com/users/test/generated/post-123/generated_video.mp4",
  },
];

const document = {
  body: { innerText: "" },
  documentElement: {},
  querySelector(selector) {
    if (selector === '[contenteditable][role="textbox"][aria-label="Ask Grok anything"]') return editable;
    if (selector === "form") return form;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "video") return videos;
    if (selector === "img") return images;
    return [];
  },
};

const context = {
  chrome: {
    runtime: {
      onMessage: { addListener(fn) { messageListener = fn; } },
      sendMessage: async () => ({ ok: true }),
    },
  },
  console: { log() {}, warn() {} },
  document,
  getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  Image: class {},
  isFinite,
  location: { href: "https://grok.com/imagine", pathname: "/imagine" },
  Math,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
  PointerEvent: class {},
  setInterval,
  clearInterval,
  setTimeout,
  window: {},
};

vm.runInNewContext(instrumentedSource, context, { filename: "content/grok-driver.js" });
assert.equal(typeof messageListener, "function", "el driver debe registrar su listener");
assert.equal(context.__grokTest.imageDimensionsLookFinal({ complete: true, naturalWidth: 144, naturalHeight: 256 }), false,
  "el preview progresivo 144x256 de /post no debe aceptarse como resultado final");
assert.equal(context.__grokTest.imageDimensionsLookFinal({ complete: true, naturalWidth: 720, naturalHeight: 1280 }), true,
  "la salida final 720x1280 debe aceptarse");

function invoke(message) {
  return new Promise((resolve) => {
    const asyncResponse = messageListener(message, {}, resolve);
    assert.equal(asyncResponse, true);
  });
}

const inspect = await invoke({ type: "act:inspect_dom" });
assert.equal(inspect.ok, true);
assert.equal(inspect.data.hasPrompt, true);
assert.equal(inspect.data.hasSend, true);
assert.equal(inspect.data.videos, 1, "el feed Descubrir no debe contar como resultado de animacion");
assert.equal(inspect.data.attachments.count, 2, "debe reconocer los File adjuntos por CDP");

const refs = await invoke({ type: "act:wait_for_refs", expected: 2, timeoutMs: 50 });
assert.equal(refs.ok, true);
assert.equal(refs.data.fileCount, 2);

const srcs = await invoke({ type: "act:video_srcs" });
assert.deepEqual([...srcs.data.srcs], ["post-123"]);

// Las cuatro variantes data: deben viajar como huellas compactas, nunca como base64 gigantes.
const dataSrc = `data:image/jpeg;base64,${"A".repeat(60000)}B`;
images = [{
  currentSrc: dataSrc, src: dataSrc, naturalWidth: 720, naturalHeight: 1280,
  getBoundingClientRect: () => ({ width: 333, height: 592 }),
  compareDocumentPosition: () => 0,
  closest: () => null,
}];
const keys = await invoke({ type: "act:image_keys" });
assert.equal(keys.ok, true);
assert.equal(keys.data.keys.length, 1);
assert.match(keys.data.keys[0], /^data:\d+:[0-9a-f]{8}$/);
assert.ok(keys.data.keys[0].length < 40, "la huella no debe incluir el data URL completo");

// Al abrir una variante, Grok sirve el JPG desde imagine-public.x.ai; dentro de /post SI es resultado.
const publicSrc = "https://imagine-public.x.ai/imagine-public/images/post-public-1.jpg";
context.location.pathname = "/imagine/post/post-public-1";
context.location.href = "https://grok.com/imagine/post/post-public-1";
images = [{
  currentSrc: publicSrc, src: publicSrc, naturalWidth: 720, naturalHeight: 1280,
  getBoundingClientRect: () => ({ width: 473, height: 840 }),
  compareDocumentPosition: () => 0,
  closest: (selector) => selector === "main,article" ? {} : null,
}];
const postKeys = await invoke({ type: "act:image_keys" });
assert.deepEqual([...postKeys.data.keys], ["post:post-public-1"]);

console.log("OK: grok driver filtra feed, confirma adjuntos y reconoce grilla/post con huellas compactas");
