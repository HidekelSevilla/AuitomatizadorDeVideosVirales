import assert from "node:assert/strict";
import {
  IMAGE_INSPECTION_MAX_EDGE,
  imageInspectionSize,
  inspectDecodedImage,
  inspectImageBuffer,
} from "../offscreen/frame-extractor.js";

assert.deepEqual(imageInspectionSize(720, 1280), { width: 72, height: 128 },
  "9:16 debe conservar su aspecto al reducir");
assert.deepEqual(imageInspectionSize(1280, 720), { width: 128, height: 72 },
  "16:9 debe conservar su aspecto al reducir");
assert.deepEqual(imageInspectionSize(64, 32), { width: 64, height: 32 },
  "una imagen pequena no debe ampliarse");
assert.equal(IMAGE_INSPECTION_MAX_EDGE, 128);

function rgba(width, height, rgbAt) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = rgbAt(x, y);
    const i = (y * width + x) * 4;
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  }
  return out;
}

const sampleWidth = 72;
const sampleHeight = 128;
const smooth = rgba(sampleWidth, sampleHeight, (x, y) => [40 + x, 50 + y, 80 + Math.floor((x + y) / 3)]);
let drawArgs = null;
const canvas = {
  width: 0,
  height: 0,
  getContext() {
    return {
      drawImage(...args) { drawArgs = args; },
      getImageData(x, y, width, height) {
        assert.deepEqual([x, y, width, height], [0, 0, sampleWidth, sampleHeight]);
        return { data: smooth };
      },
    };
  },
};
const decoded = { width: 720, height: 1280 };
const diagnostic = inspectDecodedImage(decoded, canvas);
assert.equal(diagnostic.looksFinal, true);
assert.equal(diagnostic.isNoise, false);
assert.deepEqual([canvas.width, canvas.height], [sampleWidth, sampleHeight]);
assert.deepEqual(drawArgs.slice(1), [0, 0, sampleWidth, sampleHeight]);
assert.deepEqual(
  [diagnostic.sourceWidth, diagnostic.sourceHeight, diagnostic.sampleWidth, diagnostic.sampleHeight],
  [720, 1280, 72, 128],
);

// Prueba la ruta ArrayBuffer -> Blob -> createImageBitmap -> canvas sin depender de un decoder real.
const previousCreateImageBitmap = globalThis.createImageBitmap;
const previousDocument = globalThis.document;
let bitmapClosed = false;
globalThis.createImageBitmap = async (blob) => {
  assert.equal(blob.type, "image/jpeg");
  assert.equal(blob.size, 4);
  return { width: 720, height: 1280, close() { bitmapClosed = true; } };
};
globalThis.document = { createElement: (tag) => {
  assert.equal(tag, "canvas");
  return canvas;
} };
try {
  const fromBuffer = await inspectImageBuffer(new Uint8Array([1, 2, 3, 4]).buffer, "image/jpeg");
  assert.equal(fromBuffer.looksFinal, true);
  assert.equal(bitmapClosed, true, "ImageBitmap debe liberarse despues del analisis");
} finally {
  if (previousCreateImageBitmap === undefined) delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap = previousCreateImageBitmap;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

await assert.rejects(() => inspectImageBuffer(new ArrayBuffer(0)), /buffer vacio/);

console.log("OK: offscreen inspecciona bytes de imagen en canvas 128px preservando aspecto");
