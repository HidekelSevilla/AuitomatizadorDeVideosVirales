// Detector puro y barato del placeholder/frame de difusion de Grok.
//
// El caller debe decodificar la imagen y reducirla PRESERVANDO ASPECTO a un maximo de 128 px
// (idealmente con el lado corto >= 64 px). Esta funcion solo consume el RGBA resultante, por lo que
// sirve igual desde un canvas del content script, un documento offscreen o bytes ya descargados.
//
// Los umbrales se calibraron contra 4,068 imagenes legitimas del repo (2026-07-12):
//   min |rho| = 0.500, min blurVarianceRatio = 0.391, max normalizedRoughness = 0.646.
// Ruido RGB/Gauss/coarse reducido dio, respectivamente, |rho| 0.29-0.38,
// blurVarianceRatio 0.21-0.25 y normalizedRoughness 0.89-0.95.

export const DEFAULT_GROK_NOISE_THRESHOLDS = Object.freeze({
  maxAbsNeighborCorrelation: 0.45,
  maxBlurVarianceRatio: 0.34,
  minNormalizedRoughness: 0.75,
  // Es diagnostico, no decide por si solo: una escena legitima muy colorida podria superarlo.
  strongChromaDiff: 7,
});

const varianceFromSums = (sum, sumSq, n) => {
  if (n <= 0) return 0;
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
};

/**
 * Analiza un buffer RGBA reducido.
 *
 * @param {ArrayLike<number>} rgba ImageData.data o un buffer RGBA equivalente.
 * @param {number} width ancho del buffer analizado.
 * @param {number} height alto del buffer analizado.
 * @param {object} overrides umbrales opcionales.
 * @returns {{looksFinal:boolean,isNoise:boolean,metrics:object,thresholds:object,reasons:string[]}}
 */
export function analyzeGrokImagePixels(rgba, width, height, overrides = {}) {
  const w = Math.trunc(Number(width));
  const h = Math.trunc(Number(height));
  if (!rgba || w < 3 || h < 3 || rgba.length < w * h * 4) {
    throw new TypeError("analyzeGrokImagePixels requiere RGBA valido de al menos 3x3");
  }

  const thresholds = { ...DEFAULT_GROK_NOISE_THRESHOLDS, ...(overrides || {}) };
  const pixels = w * h;
  const yPlane = new Float64Array(pixels);
  const cbPlane = new Float64Array(pixels);
  const crPlane = new Float64Array(pixels);
  let sumY = 0;
  let sumYSq = 0;

  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    const r = Number(rgba[i]) || 0;
    const g = Number(rgba[i + 1]) || 0;
    const b = Number(rgba[i + 2]) || 0;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    yPlane[p] = y;
    cbPlane[p] = -0.1146 * r - 0.3854 * g + 0.5 * b;
    crPlane[p] = 0.5 * r - 0.4542 * g - 0.0458 * b;
    sumY += y;
    sumYSq += y * y;
  }

  let pairs = 0;
  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  let sumAB = 0;
  let absoluteLumaDiff = 0;
  let absoluteChromaDiff = 0;
  const addPair = (a, b) => {
    const ya = yPlane[a];
    const yb = yPlane[b];
    pairs++;
    sumA += ya;
    sumB += yb;
    sumAA += ya * ya;
    sumBB += yb * yb;
    sumAB += ya * yb;
    absoluteLumaDiff += Math.abs(ya - yb);
    absoluteChromaDiff += (Math.abs(cbPlane[a] - cbPlane[b]) + Math.abs(crPlane[a] - crPlane[b])) / 2;
  };

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const p = row * w + col;
      if (col > 0) addPair(p, p - 1);
      if (row > 0) addPair(p, p - w);
    }
  }

  const meanA = sumA / pairs;
  const meanB = sumB / pairs;
  const varA = Math.max(0, sumAA / pairs - meanA * meanA);
  const varB = Math.max(0, sumBB / pairs - meanB * meanB);
  const covariance = sumAB / pairs - meanA * meanB;
  // Una imagen casi plana no es ruido. Evita convertir inestabilidad numerica en rho=0.
  const neighborCorrelation = varA < 1e-6 || varB < 1e-6
    ? 1
    : Math.max(-1, Math.min(1, covariance / Math.sqrt(varA * varB)));
  const lumaStdDev = Math.sqrt(varianceFromSums(sumY, sumYSq, pixels));
  const normalizedRoughness = (absoluteLumaDiff / pairs) / Math.max(lumaStdDev, 1);
  const chromaNeighborDiff = absoluteChromaDiff / pairs;

  // Compara la varianza que sobrevive a un blur 3x3 con la varianza original en los mismos
  // pixeles interiores. La estructura real sobrevive; el grano independiente se cancela.
  let interiorN = 0;
  let sumOriginal = 0;
  let sumOriginalSq = 0;
  let sumBlur = 0;
  let sumBlurSq = 0;
  for (let row = 1; row < h - 1; row++) {
    for (let col = 1; col < w - 1; col++) {
      const p = row * w + col;
      let blurred = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const base = (row + dy) * w + col;
        blurred += yPlane[base - 1] + yPlane[base] + yPlane[base + 1];
      }
      blurred /= 9;
      const original = yPlane[p];
      interiorN++;
      sumOriginal += original;
      sumOriginalSq += original * original;
      sumBlur += blurred;
      sumBlurSq += blurred * blurred;
    }
  }
  const originalVariance = varianceFromSums(sumOriginal, sumOriginalSq, interiorN);
  const blurVariance = varianceFromSums(sumBlur, sumBlurSq, interiorN);
  const blurVarianceRatio = originalVariance < 1e-6 ? 1 : blurVariance / originalVariance;

  // Conjuncion deliberadamente conservadora: ninguna metrica aislada rechaza una imagen.
  // |rho| conserva patrones periodicos legitimos (p.ej. una cuadricula) que tienen correlacion
  // negativa fuerte, a diferencia del grano aleatorio cuya correlacion queda cerca de cero.
  const weakCorrelation = Math.abs(neighborCorrelation) < Number(thresholds.maxAbsNeighborCorrelation);
  const weakCoarseStructure = blurVarianceRatio < Number(thresholds.maxBlurVarianceRatio);
  const excessiveRoughness = normalizedRoughness > Number(thresholds.minNormalizedRoughness);
  const isNoise = weakCorrelation && weakCoarseStructure && excessiveRoughness;
  const reasons = [];
  if (weakCorrelation) reasons.push("neighbor_correlation");
  if (weakCoarseStructure) reasons.push("blur_variance");
  if (excessiveRoughness) reasons.push("normalized_roughness");
  if (chromaNeighborDiff > Number(thresholds.strongChromaDiff)) reasons.push("strong_chroma_noise");

  return {
    looksFinal: !isNoise,
    isNoise,
    metrics: {
      neighborCorrelation,
      absNeighborCorrelation: Math.abs(neighborCorrelation),
      blurVarianceRatio,
      normalizedRoughness,
      chromaNeighborDiff,
      lumaStdDev,
      width: w,
      height: h,
    },
    thresholds,
    reasons,
  };
}

