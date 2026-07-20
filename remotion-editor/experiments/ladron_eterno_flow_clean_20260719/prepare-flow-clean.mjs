import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SERIES = "ladron_eterno_flow_nbp_clean_20260719";
const ORIGINAL_SERIES = "ladron_eterno";
const OUT = path.join(ROOT, "remotion-editor", "experiments", "ladron_eterno_flow_clean_20260719", "json");

const sourceFor = (part) => path.join(
  ROOT, "remotion-editor", "queue", "Manhwas", "series", ORIGINAL_SERIES,
  `ladron_eterno_parte_${String(part).padStart(2, "0")}.json`,
);

function replaceAssetSeries(value) {
  if (typeof value === "string") {
    return value
      .replaceAll(`assets/characters/${ORIGINAL_SERIES}/`, `assets/characters/${SERIES}/`)
      .replaceAll(`assets/escenarios/${ORIGINAL_SERIES}/`, `assets/escenarios/${SERIES}/`);
  }
  if (Array.isArray(value)) return value.map(replaceAssetSeries);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceAssetSeries(child)]));
  }
  return value;
}
function promptInventory(project) {
  const prompts = [];
  for (const scene of project.scenes || []) prompts.push([`scene:${scene.id}`, scene?.visual?.image_prompt || ""]);
  for (const [id, character] of Object.entries(project.characters || {})) {
    for (const [pose, def] of Object.entries(character?.poses || {})) {
      if (def && typeof def === "object") prompts.push([`character:${id}:${pose}`, def.prompt || def.generation_prompt || ""]);
    }
  }
  for (const [id, escenario] of Object.entries(project.escenarios || {})) {
    for (const [view, def] of Object.entries(escenario?.views || {})) {
      if (def && typeof def === "object") prompts.push([`escenario:${id}:${view}`, def.prompt || def.generation_prompt || ""]);
    }
  }
  return prompts;
}

fs.mkdirSync(OUT, { recursive: true });
for (const part of [1, 2]) {
  const sourcePath = sourceFor(part);
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const copy = replaceAssetSeries(source);
  const suffix = String(part).padStart(2, "0");
  copy.project = {
    ...copy.project,
    title: `El Ladrón Eterno — Flow limpio NBP — Parte ${part}`,
    serie: SERIES,
    slug: `${SERIES}_parte_${suffix}_images`,
    comparison_variant: "flow_images_only",
    comparison_series: SERIES,
    comparison_id: `${SERIES}_parte_${suffix}`,
    force_new_flow_project: true,
    flow_project_mode: "new",
  };
  copy.pipeline = {
    ...copy.pipeline,
    image_generation: { ...(copy.pipeline?.image_generation || {}), tool: "flow", model: "Nano Banana Pro" },
    animation: { ...(copy.pipeline?.animation || {}), tool: "none" },
  };

  assert.deepEqual(promptInventory(copy), promptInventory(source), `parte ${part}: ningun prompt puede cambiar`);
  const serialized = JSON.stringify(copy, null, 2) + "\n";
  assert(!serialized.includes(`assets/characters/${ORIGINAL_SERIES}/`), `parte ${part}: quedo un asset de personajes viejo`);
  assert(!serialized.includes(`assets/escenarios/${ORIGINAL_SERIES}/`), `parte ${part}: quedo un asset de escenarios viejo`);
  assert(serialized.includes(`assets/characters/${SERIES}/`), `parte ${part}: faltan rutas de la serie nueva`);
  const dest = path.join(OUT, `${SERIES}_parte_${suffix}_images.json`);
  fs.writeFileSync(dest, serialized, "utf8");
  console.log(path.relative(ROOT, dest).replace(/\\/g, "/"));
}
