// Test de tabla de la maquina de estados pura de la escena (lib/queue.js sceneTransition).
// node tests/scene_transition.test.mjs
import assert from "node:assert";
import { SCENE_STATUS } from "../lib/messaging.js";
import { sceneTransition } from "../lib/queue.js";

const S = SCENE_STATUS;

// Happy path completo: pending -> ... -> done.
const happy = [
  [S.PENDING, "start_image", S.GENERATING_IMAGE],
  [S.GENERATING_IMAGE, "image_ready", S.IMAGE_DONE],
  [S.IMAGE_DONE, "start_anim", S.ANIMATING],
  [S.ANIMATING, "video_ready", S.DOWNLOADING],
  [S.DOWNLOADING, "downloaded", S.EXTRACTING_FRAME],
  [S.EXTRACTING_FRAME, "framed", S.DONE],
];
for (const [from, ev, to] of happy) {
  assert.equal(sceneTransition(from, ev), to, `${from} --${ev}--> ${to}`);
}

// fail desde cualquier estado no-terminal -> error.
for (const st of [S.GENERATING_IMAGE, S.IMAGE_DONE, S.ANIMATING, S.DOWNLOADING, S.EXTRACTING_FRAME]) {
  assert.equal(sceneTransition(st, "fail"), S.ERROR, `${st} --fail--> error`);
}

// Reintentos: validos desde cualquier estado (incluido ERROR).
assert.equal(sceneTransition(S.ERROR, "retry_image"), S.PENDING, "retry_image -> pending");
assert.equal(sceneTransition(S.ERROR, "retry_anim"), S.IMAGE_DONE, "retry_anim -> image_done");
assert.equal(sceneTransition(S.ERROR, "retry_download"), S.ANIMATING, "retry_download -> animating");
assert.equal(sceneTransition(S.DONE, "reset"), S.PENDING, "reset -> pending");

// Evento no aplicable: NO cambia el estado (no transiciones imposibles).
assert.equal(sceneTransition(S.PENDING, "video_ready"), S.PENDING, "evento invalido = sin cambio");
assert.equal(sceneTransition(S.DONE, "start_anim"), S.DONE, "terminal estable salvo retry/reset");

console.log("OK: sceneTransition - happy path, fail, reintentos y eventos invalidos.");
