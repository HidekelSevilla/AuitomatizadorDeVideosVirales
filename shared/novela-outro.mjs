const PRESET_FOLDERS = Object.freeze({
  "novela-coreana": "novelaESP",
  "novelas-coreanas-eng": "novelaENG",
});

const PRESET_AUDIO_FOLDERS = Object.freeze({
  "novela-coreana": "novelaAudiosESP",
  "novelas-coreanas-eng": "novelaAudiosENG",
});

export function novelaOutroFolder(preset) {
  return PRESET_FOLDERS[preset] ?? null;
}

export function novelaOutroAudioFolder(preset) {
  return PRESET_AUDIO_FOLDERS[preset] ?? null;
}

function numberedFiles(names, extension) {
  const pattern = new RegExp(`^(\\d+)\\.${extension}$`, "i");
  return names
    .map((name) => {
      const match = pattern.exec(name);
      return match ? { name, number: Number(match[1]) } : null;
    })
    .filter((entry) => entry && Number.isSafeInteger(entry.number) && entry.number > 0)
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
}

export function numberedNovelaOutros(names) {
  return numberedFiles(names, "mp4");
}

export function numberedNovelaOutroAudios(names) {
  return numberedFiles(names, "mp3");
}

// FNV-1a: la eleccion parece aleatoria entre novelas, pero es estable para el mismo slug.
// Asi un re-render no cambia silenciosamente el CTA ni deja resultados distintos a mitad de una exportacion.
export function stableNovelaOutroIndex(seed, count) {
  if (!Number.isSafeInteger(count) || count <= 0) return -1;
  let hash = 0x811c9dc5;
  for (const char of String(seed)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % count;
}

export function selectNumberedNovelaOutro(names, seed) {
  const files = numberedNovelaOutros(names);
  const index = stableNovelaOutroIndex(seed, files.length);
  return index < 0 ? null : { ...files[index], count: files.length };
}

export function selectNumberedNovelaOutroAudio(names, seed) {
  const files = numberedNovelaOutroAudios(names);
  const index = stableNovelaOutroIndex(seed, files.length);
  return index < 0 ? null : { ...files[index], count: files.length };
}
