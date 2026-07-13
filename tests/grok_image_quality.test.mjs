import assert from "node:assert/strict";
import {
  analyzeGrokImagePixels,
  DEFAULT_GROK_NOISE_THRESHOLDS,
} from "../shared/grok-image-quality.mjs";

function rgba(width, height, rgbAt) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(x, y);
      const i = (y * width + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const w = 96;
const h = 128;

const smoothPanel = rgba(w, h, (x, y) => [
  25 + Math.round(150 * x / (w - 1)),
  35 + Math.round(110 * y / (h - 1)),
  70 + Math.round(80 * (x + y) / (w + h - 2)),
]);
assert.equal(analyzeGrokImagePixels(smoothPanel, w, h).isNoise, false,
  "un panel suave con estructura debe pasar");

const hardEdgePanel = rgba(w, h, (x, y) => x < w / 2
  ? [5 + (y % 7), 8, 14]
  : [238, 242 - (y % 5), 248]);
assert.equal(analyzeGrokImagePixels(hardEdgePanel, w, h).isNoise, false,
  "un borde legitimo de alto contraste no debe confundirse con ruido");

const checkerboard = rgba(w, h, (x, y) => ((x + y) % 2 ? [245, 245, 245] : [10, 10, 10]));
const checkerResult = analyzeGrokImagePixels(checkerboard, w, h);
assert.equal(checkerResult.isNoise, false,
  "un patron periodico extremo conserva |rho| alto y no debe rechazarse como grano aleatorio");
assert.ok(checkerResult.metrics.neighborCorrelation < -0.9);

const rand = seededRandom(0xC0D3);
const randomNoise = rgba(w, h, () => [
  Math.floor(rand() * 256),
  Math.floor(rand() * 256),
  Math.floor(rand() * 256),
]);
const noiseResult = analyzeGrokImagePixels(randomNoise, w, h);
assert.equal(noiseResult.isNoise, true, "el grano RGB aleatorio debe rechazarse");
assert.ok(noiseResult.metrics.absNeighborCorrelation < DEFAULT_GROK_NOISE_THRESHOLDS.maxAbsNeighborCorrelation);
assert.ok(noiseResult.metrics.blurVarianceRatio < DEFAULT_GROK_NOISE_THRESHOLDS.maxBlurVarianceRatio);
assert.ok(noiseResult.metrics.normalizedRoughness > DEFAULT_GROK_NOISE_THRESHOLDS.minNormalizedRoughness);

// Cada metrica aislada es insuficiente: una cuadricula (rho negativa fuerte), un borde o una imagen
// plana pueden ser legitimos. La decision debe seguir siendo una conjuncion de las tres senales.
const flat = rgba(w, h, () => [90, 90, 90]);
assert.equal(analyzeGrokImagePixels(flat, w, h).isNoise, false, "un fondo plano minimalista debe pasar");

assert.throws(() => analyzeGrokImagePixels(new Uint8ClampedArray(4), 1, 1), /RGBA valido/);

console.log("OK: detector estructural de ruido Grok conserva imagenes legitimas y rechaza grano aleatorio");
