// Parser puro del stream SSE de Fish Audio /v1/tts/stream/with-timestamp.
//
// Fish entrega audio incremental, pero alignment es una FOTO ACUMULATIVA por chunk_seq:
// cada snapshot nuevo reemplaza al anterior del mismo chunk. Conservar todos los snapshots
// duplica palabras y termina produciendo subtitulos/karaoke repetidos.
export function parseFishTimestampSse(raw) {
  const audioBase64Parts = [];
  const alignmentByChunk = new Map();
  const legacyAlignments = [];

  for (const block of String(raw || "").split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data || data === "[DONE]") continue;

    let event;
    try { event = JSON.parse(data); } catch (_error) { continue; }
    if (typeof event.audio_base64 === "string" && event.audio_base64) {
      audioBase64Parts.push(event.audio_base64);
    }

    const segments = Array.isArray(event?.alignment?.segments)
      ? event.alignment.segments
      : null;
    if (!segments) continue;

    const snapshot = {
      offset: typeof event.chunk_audio_offset_sec === "number" ? event.chunk_audio_offset_sec : 0,
      segments,
    };
    // Compatibilidad con respuestas antiguas sin chunk_seq: antes alignment podia actuar
    // como delta; en ese caso conservamos cada bloque en vez de sobrescribirlo.
    if (event.chunk_seq === undefined || event.chunk_seq === null) legacyAlignments.push(snapshot);
    else alignmentByChunk.set(String(event.chunk_seq), snapshot);
  }

  const words = [];
  for (const snapshot of [...alignmentByChunk.values(), ...legacyAlignments]) {
    for (const segment of snapshot.segments) {
      const word = String(segment?.text || "").trim();
      if (!word) continue;
      words.push({
        word,
        start: round3((Number(segment.start) || 0) + snapshot.offset),
        end: round3((Number(segment.end) || 0) + snapshot.offset),
      });
    }
  }

  return { audioBase64Parts, words };
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
