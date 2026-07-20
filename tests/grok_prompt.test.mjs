import assert from "node:assert";
import { chunkTextForTrustedInput } from "../lib/messaging.js";

const short = chunkTextForTrustedInput("short prompt", 480);
assert.deepEqual(short, ["short prompt"]);

const prompt = `${"SCENE ACTION with exact role and wardrobe. ".repeat(75)}\n` +
  `${"Continuity must remain exact 🎬. ".repeat(35)}` +
  'Camera: CLOSE-UP. VERTICAL 9:16. Exact text: "VOLVERAS EL LUNES".';
const normalized = prompt.replace(/\r?\n/g, " ");
const chunks = chunkTextForTrustedInput(prompt, 480);
assert.ok(chunks.length > 1, "un prompt largo se envia en varios bloques");
assert.equal(chunks.join(""), normalized, "ningun caracter del prompt se recorta, resume o reordena");
assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 480), "cada bloque respeta el tamano CDP");
assert.ok(chunks.join("").endsWith('Exact text: "VOLVERAS EL LUNES".'), "preserva literalmente el final");

console.log("OK: prompts Grok largos se escriben completos en bloques, sin compactacion");
