import test from "node:test";
import assert from "node:assert/strict";
import { parseFishTimestampSse } from "../lib/fish-timestamp-sse.js";
import { balancedCaptionGroupSizes } from "../shared/caption-groups.mjs";

function event(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

test("Fish conserva audio incremental y reemplaza alignment acumulativo por chunk_seq", () => {
  const raw = [
    event({
      audio_base64: "YQ==",
      chunk_seq: 0,
      chunk_audio_offset_sec: 0,
      alignment: { segments: [{ text: "Hello", start: 0, end: 0.2 }] },
    }),
    event({
      audio_base64: "Yg==",
      chunk_seq: 0,
      chunk_audio_offset_sec: 0,
      alignment: { segments: [
        { text: "Hello", start: 0, end: 0.2 },
        { text: "world", start: 0.2, end: 0.5 },
      ] },
    }),
    event({
      audio_base64: "Yw==",
      chunk_seq: 1,
      chunk_audio_offset_sec: 0.5,
      alignment: { segments: [{ text: "again", start: 0, end: 0.3334 }] },
    }),
    "data: [DONE]\n\n",
  ].join("");

  assert.deepEqual(parseFishTimestampSse(raw), {
    audioBase64Parts: ["YQ==", "Yg==", "Yw=="],
    words: [
      { word: "Hello", start: 0, end: 0.2 },
      { word: "world", start: 0.2, end: 0.5 },
      { word: "again", start: 0.5, end: 0.833 },
    ],
  });
});

test("Fish mantiene compatibilidad con alignments antiguos sin chunk_seq", () => {
  const raw = event({ alignment: { segments: [{ text: "uno", start: 0, end: 0.1 }] } })
    + event({ alignment: { segments: [{ text: "dos", start: 0.1, end: 0.2 }] } });

  assert.deepEqual(parseFishTimestampSse(raw).words.map((item) => item.word), ["uno", "dos"]);
});

test("subtitulos ingleses equilibran cada bloque entre 3 y 4 palabras", () => {
  assert.deepEqual(balancedCaptionGroupSizes(9, 4, 3), [3, 3, 3]);
  assert.deepEqual(balancedCaptionGroupSizes(10, 4, 3), [4, 3, 3]);
  assert.deepEqual(balancedCaptionGroupSizes(11, 4, 3), [4, 4, 3]);
  assert.deepEqual(balancedCaptionGroupSizes(12, 4, 3), [4, 4, 4]);
  assert.deepEqual(balancedCaptionGroupSizes(5, 4, 3), [3, 2]);
});
