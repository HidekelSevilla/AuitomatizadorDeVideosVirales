import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectMediaSignature } from "../shared/media-requirements.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const editor = path.join(repo, "remotion-editor");
const outputRoot = path.join(editor, "experiments", "ladron_eterno_flow_v2_final_20260720");
const outputJson = path.join(outputRoot, "json");
const finalSeries = "ladron_eterno_flow_v2_final_20260720";
const flowProjectSeries = "ladron_eterno_flow_characters_v3_20260719";

const parts = [
  {
    part: 1,
    source: path.join(editor, "experiments", "ladron_eterno_flow_nb2_restart_20260719", "json", "ladron_eterno_flow_nb2_restart_20260719_parte_01_images.json"),
    sourceSlug: "ladron_eterno_flow_characters_v3_20260719_parte_01_images",
  },
  {
    part: 2,
    source: path.join(editor, "queue", "Manhwas", "series", "ladron_eterno", "ladron_eterno_parte_02.json"),
    sourceSlug: "ladron_eterno_flow_characters_v3_20260719_parte_02_images",
  },
  {
    part: 3,
    source: path.join(editor, "queue", "Manhwas", "series", "ladron_eterno", "ladron_eterno_parte_03.json"),
    sourceSlug: null,
  },
];

const TAG_RE = /\[(?:short pause|long pause|inhales deeply|inhales|exhales deeply|exhales|whispers|whispering|shouts|shouting|sighs|sighing|laughs|laughing|gasps|gasping|angry|curious|cold)\]/i;

function copyExistingImages(sourceSlug, targetSlug) {
  if (!sourceSlug) return 0;
  const sourceDir = path.join(editor, "public", sourceSlug, "images");
  const targetDir = path.join(editor, "public", targetSlug, "images");
  if (!fs.existsSync(sourceDir)) return 0;
  fs.mkdirSync(targetDir, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (!fs.existsSync(target)) fs.copyFileSync(source, target);
    copied += 1;
  }
  return copied;
}

function writeMediaSignature(project, slug) {
  const targetDir = path.join(editor, "public", slug);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, ".media-signature.json"), JSON.stringify({
    signature: projectMediaSignature(project),
    reason: "prepared-flow-v2-final",
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

fs.mkdirSync(outputJson, { recursive: true });
const report = [];

for (const spec of parts) {
  const raw = JSON.parse(fs.readFileSync(spec.source, "utf8"));
  const sourceText = JSON.stringify(raw);
  if (TAG_RE.test(sourceText)) throw new Error(`Parte ${spec.part}: el original corregido todavia contiene tags V3`);
  if (raw.tts_export?.model_id !== "eleven_multilingual_v2") {
    throw new Error(`Parte ${spec.part}: el original corregido no declara eleven_multilingual_v2`);
  }
  // Copia estructural sin tocar narracion, prompts, referencias ni biblias visuales.
  const project = structuredClone(raw);
  const suffix = String(spec.part).padStart(2, "0");
  const slug = `${finalSeries}_parte_${suffix}`;

  project.project = {
    ...project.project,
    title: `El Ladrón Eterno — Parte ${spec.part} — Flow + ElevenLabs v2`,
    // `serie` gobierna la raiz de assets y debe conservar `ladron_eterno`; el slug y los
    // identificadores de comparacion separan estas salidas finales sin duplicar ingredientes.
    serie: project.project.serie || "ladron_eterno",
    slug,
    comparison_variant: "flow_images_only",
    comparison_series: flowProjectSeries,
    comparison_id: `${finalSeries}_parte_${suffix}`,
    force_new_flow_project: false,
    flow_project_mode: "reuse",
  };
  project.pipeline = project.pipeline || {};
  project.pipeline.image_generation = { ...(project.pipeline.image_generation || {}), tool: "flow", model: "Nano Banana 2" };
  project.pipeline.animation = { ...(project.pipeline.animation || {}), tool: "none" };
  project.pipeline.tts = {
    ...(project.pipeline.tts || {}),
    tool: "elevenlabs",
    model_id: "eleven_multilingual_v2",
  };
  project.tts_export = {
    ...(project.tts_export || {}),
    language: project.tts_export?.language || project.project.language || "es-419",
    mode: "dialogue",
    model_id: "eleven_multilingual_v2",
    elevenlabs_speed: 1.0,
    voice_settings: {
      ...(project.tts_export?.voice_settings || {}),
      stability: 0.5,
      similarity_boost: 0.4,
      style: 0.7,
      use_speaker_boost: true,
      speed: 1.0,
    },
    // Esta comparativa usa el ritmo editorial manhwa actual. Es independiente de
    // elevenlabs_speed (la diccion de la voz) y solo se aplica al MP4 final.
    edit_speed: 1.25,
  };
  project.audio = {
    ...(project.audio || {}),
    _continuous: true,
    _master: "voice/full.mp3",
    music_volume: 0.0325,
  };

  const serialized = `${JSON.stringify(project, null, 2)}\n`;
  if (TAG_RE.test(serialized)) throw new Error(`Parte ${spec.part}: quedaron tags V3`);
  if (project.tts_export.model_id !== "eleven_multilingual_v2") throw new Error(`Parte ${spec.part}: modelo TTS incorrecto`);
  if (project.tts_export.elevenlabs_speed !== 1.0 || project.tts_export.voice_settings?.speed !== 1.0) {
    throw new Error(`Parte ${spec.part}: ElevenLabs debe quedar en 1.00x`);
  }
  if (project.tts_export.edit_speed !== 1.25) throw new Error(`Parte ${spec.part}: edit_speed debe quedar en 1.25x`);
  if (project.audio.music_volume !== 0.0325) throw new Error(`Parte ${spec.part}: music_volume debe quedar en 0.0325`);
  if (project.pipeline.animation.tool !== "none") throw new Error(`Parte ${spec.part}: animacion no esta desactivada`);

  const target = path.join(outputJson, `${slug}.json`);
  fs.writeFileSync(target, serialized, "utf8");
  const copiedImages = copyExistingImages(spec.sourceSlug, slug);
  writeMediaSignature(project, slug);
  report.push({ part: spec.part, slug, scenes: project.scenes?.length || 0, copiedImages, json: target });
}

console.log(JSON.stringify({ ok: true, outputRoot, report }, null, 2));
