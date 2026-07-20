import { parseProject } from "./json-loader.js";
import { getClipOrder, sceneId } from "../shared/media-requirements.mjs";

const CONTINUOUS_PRESET_RE = /^(historias|criptoclaro|habitos|pov-historias)/;
const NOVELA_PRESETS = new Set(["novela-coreana", "novelas-coreanas-eng"]);
const CLASSIC_PRESETS = new Set(["esqueletos", ...NOVELA_PRESETS]);
const ALLOWED_PRESETS = new Set(["historias", "historias_reel", "criptoclaro", "criptoclaro_reel", "habitos_finanzas", "pov-historias", "manhwa", ...CLASSIC_PRESETS]);
const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
const SAFE_REF_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
// Presets de motion validos en ViralVideo.tsx (kenBurnsTransform); un typo caeria en silencio al default pan_lr.
const MANHWA_MOTION_PRESETS = new Set([
  "bottom_to_top", "top_to_bottom", "bottom_left_to_top_right", "bottom_right_to_top_left",
  "top_left_to_bottom_right", "top_right_to_bottom_left", "slow_push_in", "slow_pull_out", "static",
  "punch_in", "shake", // acentos de impacto (2026-07: punch_in = golpe de zoom que asienta; shake = temblor decayente)
  "slow_zoom", "slow_pan", // V7: motion seguro exclusivo de OTHER_FULL_BLEED / OTHER_SPLASH
  // alias que kenBurnsTransform tambien renderiza (compat con JSONs viejos/externos):
  "pan_lr", "pan_left_right", "pan_rl", "pan_right_left", "tilt_down", "static_hold", "push_in", "pull_out",
]);
// Transiciones de entrada por escena (manhwa). "flash" tambien lo dispara solo el render al abrir la ventana del sistema.
const MANHWA_TRANSITIONS = new Set(["cut", "crossfade", "dip_black", "flash"]);
const MANHWA_PAGE_TEMPLATE_SLOTS = new Map([
  ["STACKED_2", 2],
  ["ASYM_2", 2],
  ["STACKED_3", 3],
  ["BLACK_INSET", 1],
  ["WHITE_ISOLATE", 1],
]);
const MANHWA_V7_PAGE_TEMPLATES = new Map([
  ["WHITE_FOCUS_INSET", "WHITE_PAGE"],
  ["WHITE_ASYM_DUO", "WHITE_PAGE"],
  ["WHITE_TRIPTYCH", "WHITE_PAGE"],
  ["WHITE_ISOLATE", "WHITE_PAGE"],
  ["BLACK_SMALL_INSET", "BLACK_PAGE"],
  ["BLACK_ASYM_DUO", "BLACK_PAGE"],
  ["BLACK_REVEAL_STRIP", "BLACK_PAGE"],
  ["BLACK_FLOATING_DETAIL", "BLACK_PAGE"],
  ["OTHER_FULL_BLEED", "OTHER"],
  ["OTHER_SPLASH", "OTHER"],
  ["OTHER_CHARACTER_CLOSEUP", "OTHER"],
  ["OTHER_OBJECT_INSERT", "OTHER"],
  ["OTHER_ENVIRONMENT_BREATHER", "OTHER"],
]);
const MANHWA_V7_TEMPLATE_SLOTS = new Map([
  ["WHITE_FOCUS_INSET", 2],
  ["WHITE_ASYM_DUO", 2],
  ["WHITE_TRIPTYCH", 3],
  ["WHITE_ISOLATE", 1],
  ["BLACK_SMALL_INSET", 1],
  ["BLACK_ASYM_DUO", 2],
  ["BLACK_REVEAL_STRIP", 1],
  ["BLACK_FLOATING_DETAIL", 2],
  ["OTHER_FULL_BLEED", 1],
  ["OTHER_SPLASH", 1],
  ["OTHER_CHARACTER_CLOSEUP", 1],
  ["OTHER_OBJECT_INSERT", 1],
  ["OTHER_ENVIRONMENT_BREATHER", 1],
]);
const MANHWA_V7_TEMPLATE_CONTENT_ROLES = new Map([
  ["WHITE_FOCUS_INSET", ["PRIMARY", "DETAIL"]],
  ["WHITE_ASYM_DUO", ["PRIMARY", "REACTION"]],
  ["WHITE_TRIPTYCH", ["PRIMARY", "REACTION", "DETAIL"]],
  ["WHITE_ISOLATE", ["PRIMARY"]],
  ["BLACK_SMALL_INSET", ["REVEAL"]],
  ["BLACK_ASYM_DUO", ["PRIMARY", "REACTION"]],
  ["BLACK_REVEAL_STRIP", ["REVEAL"]],
  ["BLACK_FLOATING_DETAIL", ["PRIMARY", "DETAIL"]],
  ["OTHER_FULL_BLEED", ["FULL_BLEED_ACTION"]],
  ["OTHER_SPLASH", ["SPLASH_REVEAL"]],
  ["OTHER_CHARACTER_CLOSEUP", ["CHARACTER_CLOSEUP"]],
  ["OTHER_OBJECT_INSERT", ["OBJECT_DETAIL"]],
  ["OTHER_ENVIRONMENT_BREATHER", ["ENVIRONMENT_BREATHER"]],
]);
const MANHWA_V7_OVERLAP_TEMPLATES = new Set(["WHITE_FOCUS_INSET", "BLACK_FLOATING_DETAIL"]);
const MANHWA_V7_PAGE_FAMILIES = new Set(["WHITE_PAGE", "BLACK_PAGE", "OTHER"]);
const MANHWA_V7_TIMELINE_MODEL = "NARRATION_VISUAL_TRACKS_V1";
const MANHWA_V7_NARRATION_CANONICALIZATION = "NFC_LF_UTF8_NO_TRAILING_LF";
const MANHWA_V7_PROMPT_BLOCKS = ["CAMERA", "SUBJECTS", "ACTION", "ENVIRONMENT", "LIGHTING", "STYLE", "NEGATIVE"];
const MANHWA_V7_PAGE_LANGUAGE_RE = /\b(?:pages?|panels?|insets?|gutters?|margins?|(?:white|black)\s+space\s+occupying)\b/i;
const MANHWA_V7_RELATIVE_SCENARIO_RE = /\b(?:same\s+(?:(?:places?|locations?|rooms?|environments?|settings?|sites?|facilit(?:y|ies)|morgues?|architectures?|geometr(?:y|ies)|materials?)(?:\s+as\s+before)?|as\s+before)|(?:igual\s+que|como)\s+antes|(?:el\s+mismo|la\s+misma|los\s+mismos|las\s+mismas)\s+(?:lugar(?:es)?|ubicaci[o\u00f3]n(?:es)?|salas?|entornos?|escenarios?|sitios?|instalaci[o\u00f3]n(?:es)?|morgues?|arquitecturas?|geometr[i\u00ed]as?|material(?:es)?))\b/i;
const MANHWA_V7_CAMERA_LANGUAGE_RE = /\b(?:camera|shots?|close[-\s]?ups?|medium\s+shots?|wide\s+shots?|eye[-\s]?level|low[-\s]?angle|high[-\s]?angle|front(?:al)?\s+view|profile\s+view|top[-\s]?down|overhead|bird['’]?s[-\s]?eye|worm['’]?s[-\s]?eye|pov|point\s+of\s+view|lenses?|azimuth|roll_deg|viewpoint|elevation|foreground|background|near\s+plane|far\s+plane|frame\s+edge|screen[-\s]?(?:left|right)|\d+\s*mm)\b/i;
const MANHWA_V7_CHARACTER_DESCRIPTOR_FIELDS = ["age", "build", "face", "hair_or_skin", "wardrobe", "materials", "colors", "marks"];
const MANHWA_V7_SCENARIO_DESCRIPTOR_FIELDS = ["architecture", "layout", "materials", "anchors", "palette"];
const MANHWA_V7_PERFORMANCE_FIELDS = ["emotion", "body", "gaze", "hands"];
const MANHWA_V7_SHOT_SCALES = new Set(["MACRO", "EXTREME_CLOSE", "CLOSE", "MEDIUM", "FULL", "WIDE_MASTER", "TRUE_LONG"]);
const MANHWA_V7_VIEW_SCALES = new Set([...MANHWA_V7_SHOT_SCALES, "ENVIRONMENT_WIDE"]);
const MANHWA_V7_ELEVATIONS = new Set(["EYE_LEVEL", "LOW", "HIGH", "BIRDS_EYE", "TOP_DOWN", "WORMS_EYE", "KNEE_LEVEL", "GROUND_LEVEL"]);
const MANHWA_V7_VIEWPOINTS = new Set(["FRONT", "THREE_QUARTER_FRONT", "PROFILE", "OTS", "POV", "REAR", "REAR_THREE_QUARTER"]);
const MANHWA_V7_SPATIAL_ROLE_MIN_VIEWS = new Map([
  ["PRIMARY", 6],
  ["SECONDARY", 3],
  ["INCIDENTAL", 1],
]);
// V7 Grok-native: esta metadata audita la pagina que Grok dibuja completa. No son
// slots de compositor ni coordenadas que el editor deba reconstruir.
const MANHWA_V7_NATIVE_PAGE_LAYOUTS = new Map([
  ["WHITE_INSET", { family: "WHITE_PAGE", panels: 1, anchor: "one inset" }],
  ["WHITE_COMPOSITE_2", { family: "WHITE_PAGE", panels: 2, anchor: "two-panel composite" }],
  ["WHITE_ISOLATE", { family: "WHITE_PAGE", panels: 1, anchor: "isolated single panel" }],
  ["WHITE_FRAGMENT", { family: "WHITE_PAGE", panels: 1, anchor: "fragmented single panel" }],
  ["WHITE_ACTION_STRIP_2", { family: "WHITE_PAGE", panels: 2, anchor: "two action strips" }],
  ["WHITE_TRIPTYCH", { family: "WHITE_PAGE", panels: 3, anchor: "three-panel triptych" }],
  ["BLACK_INSET", { family: "BLACK_PAGE", panels: 1, anchor: "one inset" }],
  ["BLACK_COMPOSITE_2", { family: "BLACK_PAGE", panels: 2, anchor: "two-panel composite" }],
  ["BLACK_REVEAL_STRIP", { family: "BLACK_PAGE", panels: 1, anchor: "one reveal strip" }],
  ["BLACK_FLOATING_DETAIL", { family: "BLACK_PAGE", panels: 2, anchor: "one main panel with one floating detail" }],
  ["BLACK_TRIPTYCH", { family: "BLACK_PAGE", panels: 3, anchor: "three-panel triptych" }],
  ["FULL_BLEED", { family: "OTHER", panels: 1, anchor: "Full-bleed vertical webtoon panel" }],
  ["SPLASH", { family: "OTHER", panels: 1, anchor: "Full-page vertical manhwa splash panel" }],
  ["CHARACTER_CLOSEUP", { family: "OTHER", panels: 1, anchor: "Full-page vertical character close-up" }],
  ["OBJECT_DETAIL", { family: "OTHER", panels: 1, anchor: "Full-page vertical object detail" }],
  ["ENVIRONMENT_BREATHER", { family: "OTHER", panels: 1, anchor: "Full-page vertical environment breather" }],
  ["TALL_ACTION", { family: "OTHER", panels: 1, anchor: "Tall vertical action panel" }],
]);
const MANHWA_V7_NATIVE_NEGATIVE_TOKENS = [
  "no readable text", "no speech bubbles", "no captions", "no watermark", "no logo",
];
const MANHWA_V7_NATIVE_CAMERA_TERMS = {
  scale: new Map([
    ["MACRO", ["macro"]], ["EXTREME_CLOSE", ["extreme close-up", "extreme closeup"]],
    ["CLOSE", ["close shot", "close-up", "closeup"]], ["MEDIUM", ["medium shot", "waist-up", "waist up"]],
    ["FULL", ["full shot", "full-body", "full body"]], ["WIDE_MASTER", ["wide master", "wide shot"]],
    ["TRUE_LONG", ["true long shot", "long shot", "distant shot", "extreme wide"]],
  ]),
  elevation: new Map([
    ["EYE_LEVEL", ["eye-level", "eye level"]], ["LOW", ["low-angle", "low angle"]],
    ["HIGH", ["high-angle", "high angle"]], ["BIRDS_EYE", ["bird's-eye", "birds-eye", "bird eye"]],
    ["TOP_DOWN", ["top-down", "top down"]], ["WORMS_EYE", ["worm's-eye", "worms-eye", "worm eye"]],
    ["KNEE_LEVEL", ["knee-level", "knee level"]], ["GROUND_LEVEL", ["ground-level", "ground level"]],
  ]),
  viewpoint: new Map([
    ["FRONT", ["front view", "frontal view"]], ["THREE_QUARTER_FRONT", ["three-quarter front", "three quarter front"]],
    ["PROFILE", ["profile view", "side profile"]], ["OTS", ["over-the-shoulder", "over the shoulder", "ots view"]],
    ["POV", ["point-of-view", "point of view", "pov view"]], ["REAR", ["rear view", "back view"]],
    ["REAR_THREE_QUARTER", ["rear three-quarter", "rear three quarter"]],
  ]),
};
const MANHWA_PAGE_FITS = new Set(["cover", "contain"]);
const MANHWA_PAGE_SHAPES = new Set(["rect", "rounded", "circle", "diagonal_left", "diagonal_right"]);
const MANHWA_PAGE_HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const SAFE_SLUG_SEGMENT = /^[a-z0-9_][a-z0-9_-]*$/;
const VALID_ASPECTS = new Set(["9:16", "16:9"]);

function cleanString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeText(v) {
  return cleanString(v).replace(/\s+/g, " ");
}

function finiteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function nonnegativeInteger(v) {
  return finiteNumber(v) && Number.isInteger(v) && v >= 0;
}

function runtimeSlotToken(value, fallback) {
  const token = cleanString(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return token || fallback;
}

function v7PromptSections(errors, label, prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  const text = prompt.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines.length !== MANHWA_V7_PROMPT_BLOCKS.length || lines.some((line) => !line.trim())) {
    errors.push(`${label}: prompt V7 debe tener exactamente siete lineas fisicas no vacias, una por bloque ${MANHWA_V7_PROMPT_BLOCKS.join("/")}.`);
    return null;
  }
  const sections = {};
  for (const [index, name] of MANHWA_V7_PROMPT_BLOCKS.entries()) {
    const prefix = `${name}:`;
    const line = lines[index];
    if (!line.startsWith(prefix)) {
      errors.push(`${label}: linea ${index + 1} debe comenzar exactamente con ${prefix}`);
      return null;
    }
    const value = line.slice(prefix.length).trim();
    if (!value) errors.push(`${label}: bloque ${name}: no puede estar vacio.`);
    sections[name] = value;
  }
  if (MANHWA_V7_PAGE_LANGUAGE_RE.test(text)) {
    errors.push(`${label}: el prompt fuente no puede pedir pagina, inset, gutter, borde o margen; el compositor aplica el layout.`);
  }
  if (MANHWA_V7_RELATIVE_SCENARIO_RE.test(sections.ENVIRONMENT)) {
    errors.push(`${label}.ENVIRONMENT no puede usar atajos espaciales relativos (same place/as before, igual que antes, como antes, el mismo lugar); describe identidad y geometria absolutas.`);
  }
  for (const required of ["no readable text", "no speech bubbles", "no watermark", "no logo"]) {
    if (!containsExactText(sections.NEGATIVE, required)) {
      errors.push(`${label}.NEGATIVE debe incluir exactamente "${required}".`);
    }
  }
  return sections;
}

function textFragments(value) {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value) && value.length && value.every((item) => typeof item === "string" && item.trim())) {
    return value.map((item) => item.trim());
  }
  return [];
}

function containsExactText(haystack, needle) {
  return cleanString(haystack).toLocaleLowerCase().includes(cleanString(needle).toLocaleLowerCase());
}

function validateV7DescriptorProfile(errors, label, profile, requiredFields, promptSignature) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    errors.push(`${label}.descriptor_profile es obligatorio.`);
    return false;
  }
  let valid = true;
  for (const field of requiredFields) {
    const fragments = textFragments(profile[field]);
    if (!fragments.length || fragments.some((fragment) => fragment.length < 2)) {
      errors.push(`${label}.descriptor_profile.${field} debe ser texto sustantivo o una lista no vacia de textos.`);
      valid = false;
      continue;
    }
    for (const fragment of fragments) {
      if (!containsExactText(promptSignature, fragment)) {
        errors.push(`${label}.prompt_signature debe contener exactamente descriptor_profile.${field}: "${fragment}".`);
        valid = false;
      }
    }
  }
  return valid;
}

function parseV7CameraBlock(errors, label, cameraText) {
  const number = "(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))";
  const re = new RegExp(`^scale=([^;\\n]+); elevation=([^;\\n]+); viewpoint=([^;\\n]+); azimuth_deg=${number}; lens_mm=${number}; roll_deg=${number}; dominant_subject=([^;\\n]+); occupancy_pct=${number}\\.$`);
  const match = cleanString(cameraText).match(re);
  if (!match) {
    errors.push(`${label}.CAMERA debe usar exactamente: CAMERA: scale=<...>; elevation=<...>; viewpoint=<...>; azimuth_deg=<num>; lens_mm=<num>; roll_deg=<num>; dominant_subject=<id>; occupancy_pct=<num>.`);
    return null;
  }
  const parsed = {
    scale: match[1].trim(),
    elevation: match[2].trim(),
    viewpoint: match[3].trim(),
    azimuth_deg: Number(match[4]),
    lens_mm: Number(match[5]),
    roll_deg: Number(match[6]),
    dominant_subject: match[7].trim(),
    occupancy_pct: Number(match[8]),
  };
  if (!parsed.scale || !parsed.elevation || !parsed.viewpoint || !parsed.dominant_subject) {
    errors.push(`${label}.CAMERA contiene un valor textual vacio.`);
    return null;
  }
  return parsed;
}

function validateV7CameraBlockAgainstLedger(errors, label, sections, ledger) {
  if (!sections) return;
  const camera = parseV7CameraBlock(errors, label, sections.CAMERA);
  if (!camera || !ledger) return;
  for (const key of ["scale", "elevation", "viewpoint", "dominant_subject"]) {
    if (camera[key] !== cleanString(ledger[key])) {
      errors.push(`${label}.CAMERA ${key}="${camera[key]}" no coincide exactamente con shot_ledger.${key}="${cleanString(ledger[key])}".`);
    }
  }
  for (const key of ["azimuth_deg", "lens_mm", "roll_deg", "occupancy_pct"]) {
    if (camera[key] !== ledger[key]) {
      errors.push(`${label}.CAMERA ${key}=${camera[key]} no coincide exactamente con shot_ledger.${key}=${ledger[key]}.`);
    }
  }
}

function validateV7CameraSignature(errors, label, signature) {
  if (!signature || typeof signature !== "object" || Array.isArray(signature)) {
    errors.push(`${label}: camera_signature obligatorio.`);
    return null;
  }
  const scale = cleanString(signature.scale);
  const elevation = cleanString(signature.elevation);
  const viewpoint = cleanString(signature.viewpoint);
  const azimuthDeg = signature.azimuth_deg;
  const lensMm = signature.lens_mm;
  const rollDeg = signature.roll_deg;
  const dominantSubject = cleanString(signature.dominant_subject);
  const occupancyPct = signature.occupancy_pct;
  if (!scale) errors.push(`${label}.camera_signature.scale es obligatorio.`);
  else if (!MANHWA_V7_VIEW_SCALES.has(scale)) errors.push(`${label}.camera_signature.scale invalido "${scale}".`);
  if (!elevation) errors.push(`${label}.camera_signature.elevation es obligatorio.`);
  else if (!MANHWA_V7_ELEVATIONS.has(elevation)) errors.push(`${label}.camera_signature.elevation invalido "${elevation}".`);
  if (!viewpoint) errors.push(`${label}.camera_signature.viewpoint es obligatorio.`);
  else if (!MANHWA_V7_VIEWPOINTS.has(viewpoint)) errors.push(`${label}.camera_signature.viewpoint invalido "${viewpoint}".`);
  if (!finiteNumber(azimuthDeg) || azimuthDeg < 0 || azimuthDeg >= 360) errors.push(`${label}.camera_signature.azimuth_deg debe estar entre 0 (incluido) y 360 (excluido).`);
  if (!finiteNumber(lensMm) || lensMm < 8 || lensMm > 300) errors.push(`${label}.camera_signature.lens_mm debe estar entre 8 y 300 mm.`);
  if (!finiteNumber(rollDeg) || rollDeg < -180 || rollDeg > 180) errors.push(`${label}.camera_signature.roll_deg debe estar entre -180 y 180.`);
  if (dominantSubject !== "environment") errors.push(`${label}.camera_signature.dominant_subject debe ser exactamente "environment".`);
  if (occupancyPct !== 100) errors.push(`${label}.camera_signature.occupancy_pct debe ser exactamente 100.`);
  return MANHWA_V7_VIEW_SCALES.has(scale) && MANHWA_V7_ELEVATIONS.has(elevation) && MANHWA_V7_VIEWPOINTS.has(viewpoint)
      && finiteNumber(azimuthDeg) && azimuthDeg >= 0 && azimuthDeg < 360
      && finiteNumber(lensMm) && lensMm >= 8 && lensMm <= 300
      && finiteNumber(rollDeg) && rollDeg >= -180 && rollDeg <= 180
      && dominantSubject === "environment" && occupancyPct === 100
    ? { scale, elevation, viewpoint, azimuth_deg: azimuthDeg, lens_mm: lensMm, roll_deg: rollDeg,
        dominant_subject: dominantSubject, occupancy_pct: occupancyPct } : null;
}

function validateV7ShotLedger(errors, label, ledger) {
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    errors.push(`${label}: shot_ledger obligatorio.`);
    return null;
  }
  for (const key of ["shot_id", "scale", "elevation", "viewpoint", "dominant_subject"]) {
    if (!cleanString(ledger[key])) errors.push(`${label}.shot_ledger.${key} es obligatorio.`);
  }
  if (cleanString(ledger.scale) && !MANHWA_V7_SHOT_SCALES.has(cleanString(ledger.scale))) errors.push(`${label}.shot_ledger.scale invalido "${ledger.scale}".`);
  if (cleanString(ledger.elevation) && !MANHWA_V7_ELEVATIONS.has(cleanString(ledger.elevation))) errors.push(`${label}.shot_ledger.elevation invalido "${ledger.elevation}".`);
  if (cleanString(ledger.viewpoint) && !MANHWA_V7_VIEWPOINTS.has(cleanString(ledger.viewpoint))) errors.push(`${label}.shot_ledger.viewpoint invalido "${ledger.viewpoint}".`);
  if (!finiteNumber(ledger.azimuth_deg) || ledger.azimuth_deg < 0 || ledger.azimuth_deg >= 360) errors.push(`${label}.shot_ledger.azimuth_deg debe estar entre 0 (incluido) y 360 (excluido).`);
  if (!finiteNumber(ledger.lens_mm) || ledger.lens_mm < 8 || ledger.lens_mm > 300) errors.push(`${label}.shot_ledger.lens_mm debe estar entre 8 y 300 mm.`);
  if (!finiteNumber(ledger.roll_deg) || ledger.roll_deg < -180 || ledger.roll_deg > 180) errors.push(`${label}.shot_ledger.roll_deg debe estar entre -180 y 180.`);
  if (!finiteNumber(ledger.occupancy_pct) || ledger.occupancy_pct < 0 || ledger.occupancy_pct > 100) errors.push(`${label}.shot_ledger.occupancy_pct debe estar entre 0 y 100.`);
  const changeMode = cleanString(ledger.change_mode);
  if (!["START", "CONTRAST", "MATCH"].includes(changeMode)) {
    errors.push(`${label}.shot_ledger.change_mode debe ser START, CONTRAST o MATCH.`);
  }
  return cleanString(ledger.shot_id) && MANHWA_V7_SHOT_SCALES.has(cleanString(ledger.scale))
      && MANHWA_V7_ELEVATIONS.has(cleanString(ledger.elevation)) && MANHWA_V7_VIEWPOINTS.has(cleanString(ledger.viewpoint))
      && cleanString(ledger.dominant_subject) && finiteNumber(ledger.azimuth_deg)
      && ledger.azimuth_deg >= 0 && ledger.azimuth_deg < 360
      && finiteNumber(ledger.lens_mm) && ledger.lens_mm >= 8 && ledger.lens_mm <= 300
      && finiteNumber(ledger.roll_deg) && ledger.roll_deg >= -180 && ledger.roll_deg <= 180
      && finiteNumber(ledger.occupancy_pct) && ledger.occupancy_pct >= 0 && ledger.occupancy_pct <= 100
    ? ledger : null;
}

function angularDistance(a, b) {
  const delta = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(delta, 360 - delta);
}

function sameToken(a, b) {
  return cleanString(a).toUpperCase() === cleanString(b).toUpperCase();
}

function rectIntersection(left, right) {
  const w = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const h = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  return w * h;
}

function slotArea(slot) {
  return finiteNumber(slot?.w) && finiteNumber(slot?.h) ? slot.w * slot.h : NaN;
}

function slotCenter(slot) {
  return finiteNumber(slot?.x) && finiteNumber(slot?.y) && finiteNumber(slot?.w) && finiteNumber(slot?.h)
    ? { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 }
    : null;
}

function partialSlotOverlap(main, detail) {
  const overlap = rectIntersection(main, detail);
  if (overlap <= 1e-9) return false;
  const contained = detail.x >= main.x && detail.y >= main.y
    && detail.x + detail.w <= main.x + main.w
    && detail.y + detail.h <= main.y + main.h;
  return !contained && overlap < Math.min(slotArea(main), slotArea(detail)) - 1e-9;
}

function validateV7TemplateGeometry(errors, id, template, slots, backgroundPct, allowOverlap) {
  if (!slots.length || slots.some((slot) => !["x", "y", "w", "h"].every((key) => finiteNumber(slot?.[key])))) return;
  const centers = slots.map(slotCenter);
  const areas = slots.map(slotArea);
  const nonOverlapping = slots.every((slot, i) => slots.slice(i + 1).every((other) => rectIntersection(slot, other) <= 1e-9));
  const centered = (center) => center && Math.abs(center.x - 0.5) <= 0.08 && Math.abs(center.y - 0.5) <= 0.08;
  const asymmetricPair = () => {
    if (slots.length !== 2 || !nonOverlapping) return false;
    const ratio = Math.max(...areas) / Math.min(...areas);
    return ratio >= 1.35 - 1e-9
      && Math.abs(centers[0].x - centers[1].x) >= 0.05 - 1e-9
      && Math.abs(centers[0].y - centers[1].y) >= 0.05 - 1e-9;
  };

  if (template === "WHITE_ISOLATE" && !centered(centers[0])) {
    errors.push(`${id}: WHITE_ISOLATE exige un slot centrado (centro x/y dentro de 0.50±0.08).`);
  }
  if (template === "WHITE_ASYM_DUO" && !asymmetricPair()) {
    errors.push(`${id}: WHITE_ASYM_DUO exige 2 slots sin solape, ratio de areas >=1.35 y centros desplazados en ambos ejes.`);
  }
  if (template === "WHITE_TRIPTYCH") {
    const orderedX = centers.every((center, i) => i === 0 || centers[i - 1].x + 0.02 <= center.x + 1e-9);
    const orderedY = centers.every((center, i) => i === 0 || centers[i - 1].y + 0.02 <= center.y + 1e-9);
    const crossAxis = orderedX ? centers.map((center) => center.y) : centers.map((center) => center.x);
    const variants = new Set(slots.map((slot, i) => `${slot.w.toFixed(3)}\u0000${crossAxis[i].toFixed(3)}`));
    if (!nonOverlapping || (!orderedX && !orderedY) || variants.size < 2) {
      errors.push(`${id}: WHITE_TRIPTYCH exige 3 slots sin solape, centros ordenados y al menos dos anchos u offsets laterales distintos.`);
    }
  }
  const measuredCoverage = finiteNumber(backgroundPct) ? 1 - backgroundPct / 100 : areas[0];
  if (template === "BLACK_SMALL_INSET" && (!centered(centers[0]) || measuredCoverage < 0.30 - 1e-6 || measuredCoverage > 0.55 + 1e-6)) {
    errors.push(`${id}: BLACK_SMALL_INSET exige un slot centrado con cobertura entre 30% y 55%.`);
  }
  if (template === "BLACK_ASYM_DUO" && !asymmetricPair()) {
    errors.push(`${id}: BLACK_ASYM_DUO exige 2 slots sin solape, ratio de areas >=1.35 y centros desplazados en ambos ejes.`);
  }
  if (template === "BLACK_REVEAL_STRIP" && Math.max(slots[0].w / slots[0].h, slots[0].h / slots[0].w) < 2.2 - 1e-9) {
    errors.push(`${id}: BLACK_REVEAL_STRIP exige aspect ratio normalizado >=2.2.`);
  }
  if (template === "BLACK_FLOATING_DETAIL") {
    if (slots.length !== 2 || areas[1] > areas[0] * 0.45 + 1e-9
        || (allowOverlap === true && !partialSlotOverlap(slots[0], slots[1]))) {
      errors.push(`${id}: BLACK_FLOATING_DETAIL exige detalle B <=45% del area principal y, si allow_overlap:true, cruce parcial de su borde.`);
    }
  }
  if (MANHWA_V7_PAGE_TEMPLATES.get(template) === "OTHER" && finiteNumber(backgroundPct)
      && 100 - backgroundPct < 90 - 1e-4) {
    errors.push(`${id}: ${template} exige cobertura visible >=90%; real ${(100 - backgroundPct).toFixed(2)}%.`);
  }
}

const V7_CANVAS_WIDTH = 720;
const V7_CANVAS_HEIGHT = 1280;
const V7_CANVAS_PIXELS = V7_CANVAS_WIDTH * V7_CANVAS_HEIGHT;
const v7MaskAreaCache = new Map();

// Python round() usa ties-to-even; replica _slot_box del compositor en coordenadas contractuales.
function roundHalfEven(value) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function v7SlotPixelPlan(slot) {
  if (!["x", "y", "w", "h"].every((key) => finiteNumber(slot?.[key]))) return null;
  const shape = cleanString(slot.shape) || "rect";
  if (!MANHWA_PAGE_SHAPES.has(shape)) return null;
  const left = roundHalfEven(slot.x * V7_CANVAS_WIDTH);
  const top = roundHalfEven(slot.y * V7_CANVAS_HEIGHT);
  const right = roundHalfEven((slot.x + slot.w) * V7_CANVAS_WIDTH);
  const bottom = roundHalfEven((slot.y + slot.h) * V7_CANVAS_HEIGHT);
  if (right <= left || bottom <= top) return null;
  const rotation = finiteNumber(slot.rotation_deg) ? ((slot.rotation_deg % 360) + 360) % 360 : 0;
  const radiusPx = nonnegativeInteger(slot.radius_px) ? slot.radius_px : (shape === "rounded" ? 24 : 0);
  return { left, top, right, bottom, width: right - left, height: bottom - top, shape, rotation, radiusPx };
}

function v7PointInsideShape(plan, localX, localY) {
  const { width, height, shape } = plan;
  if (localX < 0 || localY < 0 || localX >= width || localY >= height) return false;
  if (shape === "rect") return true;
  if (shape === "circle") {
    const diameter = Math.min(width, height);
    const cx = width / 2, cy = height / 2, radius = diameter / 2;
    const dx = localX - cx, dy = localY - cy;
    return dx * dx + dy * dy <= radius * radius;
  }
  if (shape === "rounded") {
    const radius = Math.min(plan.radiusPx, width / 2, height / 2);
    if (radius <= 0 || (localX >= radius && localX < width - radius)
        || (localY >= radius && localY < height - radius)) return true;
    const cx = localX < radius ? radius : width - radius;
    const cy = localY < radius ? radius : height - radius;
    const dx = localX - cx, dy = localY - cy;
    return dx * dx + dy * dy <= radius * radius;
  }
  // Pillow construye el corte a 4x antes de reducir. Conservamos exactamente ese cut contractual.
  const cut4 = Math.max(4, Math.min(Math.round(width * 4 * 0.14), Math.round(height * 4 * 0.20)));
  const cut = cut4 / 4;
  const taper = cut * (1 - localY / height);
  return shape === "diagonal_left" ? localX >= taper : localX <= width - taper;
}

export function measureManhwaV7BackgroundAreaPct(slots) {
  const plans = slots.map(v7SlotPixelPlan);
  if (!plans.length || plans.some((plan) => !plan)) return null;
  const key = JSON.stringify(plans);
  if (v7MaskAreaCache.has(key)) return v7MaskAreaCache.get(key);

  const coverage = new Uint8Array(V7_CANVAS_PIXELS);
  let covered = 0;
  for (const plan of plans) {
    const centerX = (plan.left + plan.right) / 2;
    const centerY = (plan.top + plan.bottom) / 2;
    const radians = plan.rotation * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const rotatedWidth = Math.abs(plan.width * cos) + Math.abs(plan.height * sin);
    const rotatedHeight = Math.abs(plan.width * sin) + Math.abs(plan.height * cos);
    const minX = Math.max(0, Math.floor(centerX - rotatedWidth / 2) - 1);
    const maxX = Math.min(V7_CANVAS_WIDTH - 1, Math.ceil(centerX + rotatedWidth / 2) + 1);
    const minY = Math.max(0, Math.floor(centerY - rotatedHeight / 2) - 1);
    const maxY = Math.min(V7_CANVAS_HEIGHT - 1, Math.ceil(centerY + rotatedHeight / 2) + 1);
    for (let y = minY; y <= maxY; y++) {
      const dy = y + 0.5 - centerY;
      let index = y * V7_CANVAS_WIDTH + minX;
      for (let x = minX; x <= maxX; x++, index++) {
        if (coverage[index]) continue;
        const dx = x + 0.5 - centerX;
        // Inversa de la rotacion positiva horaria usada por Pillow/CSS.
        const localX = cos * dx + sin * dy + plan.width / 2;
        const localY = -sin * dx + cos * dy + plan.height / 2;
        if (v7PointInsideShape(plan, localX, localY)) {
          coverage[index] = 1;
          covered++;
        }
      }
    }
  }
  const background = Number((100 * (1 - covered / V7_CANVAS_PIXELS)).toFixed(4));
  if (v7MaskAreaCache.size >= 256) v7MaskAreaCache.delete(v7MaskAreaCache.keys().next().value);
  v7MaskAreaCache.set(key, background);
  return background;
}

function validateV7AdjacentShots(errors, sources) {
  let contrastTransitions = 0;
  let matchRun = 0;
  let previousCameraKey = "";
  let cameraRun = 0;
  for (let i = 0; i < sources.length; i++) {
    const current = sources[i];
    const ledger = current.ledger;
    if (!ledger) continue;
    const mode = cleanString(ledger.change_mode);
    const cameraKey = ["scale", "elevation", "viewpoint", "azimuth_deg", "lens_mm", "roll_deg", "dominant_subject", "occupancy_pct"]
      .map((key) => String(ledger[key])).join("\u0000");
    cameraRun = cameraKey === previousCameraKey ? cameraRun + 1 : 1;
    previousCameraKey = cameraKey;
    if (cameraRun > 2) errors.push(`${current.label}.shot_ledger repite una camera_signature exacta mas de 2 fuentes consecutivas.`);
    if (i === 0) {
      if (mode !== "START") errors.push(`${current.label}.shot_ledger.change_mode debe ser START para la primera fuente.`);
      continue;
    }
    if (mode === "START") {
      errors.push(`${current.label}.shot_ledger.change_mode START solo se permite en la primera fuente.`);
      continue;
    }
    if (mode === "CONTRAST") contrastTransitions++;
    if (mode === "MATCH") {
      matchRun++;
      if (matchRun > 2) errors.push(`${current.label}.shot_ledger no permite mas de 2 MATCH consecutivos.`);
    } else matchRun = 0;
    if (!cleanString(ledger.change_reason)) {
      errors.push(`${current.label}.shot_ledger.change_reason es obligatorio entre fuentes adyacentes.`);
    }
    if (mode !== "CONTRAST") continue;
    const previous = sources[i - 1].ledger;
    if (!previous) continue;
    const changes = [
      !sameToken(ledger.scale, previous.scale),
      !sameToken(ledger.elevation, previous.elevation),
      !sameToken(ledger.viewpoint, previous.viewpoint),
      angularDistance(ledger.azimuth_deg, previous.azimuth_deg) >= 20,
      Math.abs(ledger.lens_mm - previous.lens_mm) >= 15,
      Math.abs(ledger.roll_deg - previous.roll_deg) >= 10,
      !sameToken(ledger.dominant_subject, previous.dominant_subject),
    ].filter(Boolean).length;
    if (changes < 2) {
      errors.push(`${current.label}.shot_ledger CONTRAST debe cambiar al menos 2 dimensiones frente a la fuente anterior (cambio actual: ${changes}).`);
    }
  }
  const transitionCount = Math.max(0, sources.length - 1);
  const minContrasts = Math.ceil(transitionCount * 0.60);
  if (contrastTransitions < minContrasts) {
    errors.push(`V7 shot rhythm: ${contrastTransitions}/${transitionCount} transiciones CONTRAST; minimo ${minContrasts} (60%).`);
  }
}

function validateManhwaPageBlueprint(errors, scene, page, pageSources, options = {}) {
  const isV7 = options.v7 === true;
  const id = sceneId(scene);
  if (scene?.type !== "panel") {
    errors.push(`${id}: pagina compuesta requiere type "panel" explicito.`);
  }
  const template = cleanString(page?.template);
  const expectedSlots = isV7 ? MANHWA_V7_TEMPLATE_SLOTS.get(template) : MANHWA_PAGE_TEMPLATE_SLOTS.get(template);
  const pageFamily = cleanString(page?.page_family);
  if (isV7) {
    if (cleanString(page?.version) !== "7.0") errors.push(`${id}: page_blueprint.version debe ser "7.0".`);
    if (!MANHWA_V7_PAGE_FAMILIES.has(pageFamily)) errors.push(`${id}: page_blueprint.page_family invalido "${pageFamily || "(vacio)"}".`);
    const expectedFamily = MANHWA_V7_PAGE_TEMPLATES.get(template);
    if (!expectedFamily) errors.push(`${id}: page_blueprint.template V7 invalido "${template || "(vacio)"}".`);
    else if (pageFamily && expectedFamily !== pageFamily) errors.push(`${id}: template ${template} pertenece a ${expectedFamily}, no a ${pageFamily}.`);
    const target = page?.background_area_target_pct;
    if (!Array.isArray(target) || target.length !== 2 || !target.every(finiteNumber)
        || target[0] < 0 || target[1] > 100 || target[0] > target[1]) {
      errors.push(`${id}: page_blueprint.background_area_target_pct debe ser [min,max] entre 0 y 100.`);
    }
    const familyTargetBounds = { WHITE_PAGE: [30, 60], BLACK_PAGE: [45, 70], OTHER: [0, 10] }[pageFamily];
    if (familyTargetBounds && Array.isArray(target) && target.length === 2 && target.every(finiteNumber)
        && (target[0] < familyTargetBounds[0] || target[1] > familyTargetBounds[1])) {
      errors.push(`${id}: ${pageFamily} exige background_area_target_pct dentro de [${familyTargetBounds.join(",")}].`);
    }
    if (page?.allow_overlap != null && typeof page.allow_overlap !== "boolean") errors.push(`${id}: allow_overlap debe ser booleano.`);
    if (template === "WHITE_FOCUS_INSET" && page?.allow_overlap !== true) errors.push(`${id}: WHITE_FOCUS_INSET requiere allow_overlap:true.`);
    if (page?.allow_overlap === true && !MANHWA_V7_OVERLAP_TEMPLATES.has(template)) {
      errors.push(`${id}: allow_overlap:true solo es valido para WHITE_FOCUS_INSET o BLACK_FLOATING_DETAIL.`);
    }
  } else if (!expectedSlots) {
    errors.push(`${id}: page_blueprint.template invalido "${template || "(vacio)"}" (validos: ${[...MANHWA_PAGE_TEMPLATE_SLOTS.keys()].join(", ")}, FULL_BLEED).`);
  }

  const motion = scene?.editor_motion;
  const exactStaticMotion = motion && typeof motion === "object" && !Array.isArray(motion)
    && Object.keys(motion).length === 4
    && motion.enabled === false && motion.preset === "static" && motion.zoom === 1 && motion.pan === 0;
  const requiresStaticMotion = !isV7 || !["OTHER_FULL_BLEED", "OTHER_SPLASH"].includes(template);
  if (requiresStaticMotion && !exactStaticMotion) errors.push(`${id}: pagina compuesta requiere editor_motion exacto {enabled:false,preset:"static",zoom:1,pan:0}.`);
  if (isV7 && !requiresStaticMotion && !exactStaticMotion) {
    const safeMotion = motion && typeof motion === "object" && !Array.isArray(motion)
      && motion.enabled === true && ["slow_zoom", "slow_pan"].includes(cleanString(motion.preset))
      && finiteNumber(motion.zoom) && motion.zoom >= 1 && motion.zoom <= 1.08
      && finiteNumber(motion.pan) && motion.pan >= 0 && motion.pan <= 0.03;
    if (!safeMotion) errors.push(`${id}: motion OTHER inseguro; usa static o slow_zoom/slow_pan con zoom<=1.08 y pan<=0.03.`);
  }

  const revision = page?.composition_revision ?? scene?.visual?.composition_revision ?? scene?.composition_revision ?? 1;
  if (!Number.isInteger(revision) || revision < 1) errors.push(`${id}: composition_revision debe ser un entero >= 1.`);
  const background = cleanString(page?.background);
  if (!MANHWA_PAGE_HEX_COLOR.test(background)) errors.push(`${id}: page_blueprint.background debe usar #RRGGBB o #RRGGBBAA.`);
  if (isV7 && pageFamily === "WHITE_PAGE" && background.toUpperCase() !== "#FFFFFF") errors.push(`${id}: WHITE_PAGE exige background #FFFFFF.`);
  if (isV7 && pageFamily === "BLACK_PAGE" && background.toUpperCase() !== "#050505") errors.push(`${id}: BLACK_PAGE exige background #050505.`);
  if ((isV7 || page?.gutter_px != null) && !nonnegativeInteger(page?.gutter_px)) errors.push(`${id}: page_blueprint.gutter_px debe ser un entero >= 0.`);
  if (isV7 || page?.safe_area != null) {
    const safe = page.safe_area;
    if (!safe || typeof safe !== "object" || Array.isArray(safe)) errors.push(`${id}: page_blueprint.safe_area debe ser un objeto.`);
    else for (const edge of ["top", "right", "bottom", "left"]) {
      const invalidSafe = !finiteNumber(safe[edge]) || safe[edge] < 0 || (isV7 ? safe[edge] >= 0.5 : safe[edge] > 1);
      if (invalidSafe) errors.push(`${id}: page_blueprint.safe_area.${edge} debe estar entre 0 y ${isV7 ? "0.5 (excluido)" : "1"}.`);
    }
  }
  const pageSafe = page?.safe_area && typeof page.safe_area === "object" && !Array.isArray(page.safe_area)
    && ["top", "right", "bottom", "left"].every((edge) => finiteNumber(page.safe_area[edge]))
    ? page.safe_area : null;

  const slots = Array.isArray(page?.slots) ? page.slots : [];
  if (!slots.length) errors.push(`${id}: page_blueprint.slots debe ser un array no vacio.`);
  if (expectedSlots && slots.length !== expectedSlots) errors.push(`${id}: ${template} requiere exactamente ${expectedSlots} slot(s).`);
  const readingOrder = page?.reading_order;
  if (!Array.isArray(readingOrder) || !readingOrder.every((slotId) => typeof slotId === "string" && slotId.trim())) {
    errors.push(`${id}: page_blueprint.reading_order debe ser un array de IDs de slot.`);
  }

  const slotIds = new Set();
  const runtimeTokens = new Set();
  for (const [slotIndex, slot] of slots.entries()) {
    const label = `${id}.page_blueprint.slots[${slotIndex}]`;
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      errors.push(`${label}: debe ser un objeto.`);
      continue;
    }
    const slotId = cleanString(slot.id);
    if (!slotId) errors.push(`${label}.id debe ser un string no vacio.`);
    else if (slotIds.has(slotId)) errors.push(`${label}.id duplicado: "${slotId}".`);
    else slotIds.add(slotId);
    const runtimeToken = runtimeSlotToken(slotId, String(slotIndex + 1));
    if (runtimeTokens.has(runtimeToken)) errors.push(`${label}.id colisiona en runtime con otro slot (token "${runtimeToken}").`);
    else runtimeTokens.add(runtimeToken);

    if (!normalizeText(slot.prompt)) errors.push(`${label}: prompt generable obligatorio.`);
    if (isV7) v7PromptSections(errors, label, slot.prompt);
    const source = cleanString(slot.source).replace(/\\/g, "/");
    if (!/^images\/cells\/[a-z0-9][a-z0-9_.-]*\.(jpg|jpeg|png|webp)$/i.test(source) || source.includes("..")) {
      errors.push(`${label}.source debe ser una ruta segura bajo images/cells/.`);
    } else if (pageSources.has(source.toLowerCase())) {
      errors.push(`${label}.source duplicado: "${source}".`);
    } else pageSources.add(source.toLowerCase());

    const geometry = ["x", "y", "w", "h"];
    for (const key of geometry) if (!finiteNumber(slot[key])) errors.push(`${label}.${key} debe ser un numero finito.`);
    if (geometry.every((key) => finiteNumber(slot[key]))) {
      if (slot.x < 0 || slot.y < 0 || slot.w <= 0 || slot.h <= 0 || slot.x + slot.w > 1 + 1e-9 || slot.y + slot.h > 1 + 1e-9) {
        errors.push(`${label}: la geometria x/y/w/h debe permanecer dentro del canvas normalizado.`);
      }
      if (isV7 && pageSafe && (slot.x + 1e-9 < pageSafe.left || slot.y + 1e-9 < pageSafe.top
          || slot.x + slot.w > 1 - pageSafe.right + 1e-9
          || slot.y + slot.h > 1 - pageSafe.bottom + 1e-9)) {
        errors.push(`${label}: slot invade page_blueprint.safe_area.`);
      }
    }
    const fit = cleanString(slot.fit) || "cover";
    if (!MANHWA_PAGE_FITS.has(fit)) errors.push(`${label}.fit invalido "${fit}".`);
    const shape = cleanString(slot.shape) || "rect";
    if (!MANHWA_PAGE_SHAPES.has(shape)) errors.push(`${label}.shape invalido "${shape}".`);
    const focal = slot.focal_point ?? { x: 0.5, y: 0.5 };
    if (!focal || typeof focal !== "object" || Array.isArray(focal)
        || !finiteNumber(focal.x ?? 0.5) || !finiteNumber(focal.y ?? 0.5)
        || (focal.x ?? 0.5) < 0 || (focal.x ?? 0.5) > 1 || (focal.y ?? 0.5) < 0 || (focal.y ?? 0.5) > 1) {
      errors.push(`${label}.focal_point debe contener x/y entre 0 y 1.`);
    }
    for (const key of ["z", "rotation_deg"]) if (slot[key] != null && !finiteNumber(slot[key])) errors.push(`${label}.${key} debe ser un numero finito.`);
    if (isV7 && pageSafe && geometry.every((key) => finiteNumber(slot[key])) && finiteNumber(slot.rotation_deg ?? 0)) {
      const radians = (slot.rotation_deg ?? 0) * Math.PI / 180;
      const widthPx = slot.w * V7_CANVAS_WIDTH, heightPx = slot.h * V7_CANVAS_HEIGHT;
      const rotatedWidth = Math.abs(widthPx * Math.cos(radians)) + Math.abs(heightPx * Math.sin(radians));
      const rotatedHeight = Math.abs(widthPx * Math.sin(radians)) + Math.abs(heightPx * Math.cos(radians));
      const centerX = (slot.x + slot.w / 2) * V7_CANVAS_WIDTH;
      const centerY = (slot.y + slot.h / 2) * V7_CANVAS_HEIGHT;
      if (centerX - rotatedWidth / 2 < pageSafe.left * V7_CANVAS_WIDTH - 1e-6
          || centerX + rotatedWidth / 2 > (1 - pageSafe.right) * V7_CANVAS_WIDTH + 1e-6
          || centerY - rotatedHeight / 2 < pageSafe.top * V7_CANVAS_HEIGHT - 1e-6
          || centerY + rotatedHeight / 2 > (1 - pageSafe.bottom) * V7_CANVAS_HEIGHT + 1e-6) {
        errors.push(`${label}.rotation_deg: bounding box rotado invade page_blueprint.safe_area.`);
      }
    }
    for (const key of ["border_px", "radius_px"]) if (slot[key] != null && !nonnegativeInteger(slot[key])) errors.push(`${label}.${key} debe ser un entero >= 0.`);
    if (slot.border_color != null && !MANHWA_PAGE_HEX_COLOR.test(cleanString(slot.border_color))) {
      errors.push(`${label}.border_color debe usar #RRGGBB o #RRGGBBAA.`);
    }
  }

  if (Array.isArray(readingOrder)) {
    const readingSet = new Set(readingOrder);
    if (readingSet.size !== readingOrder.length || readingOrder.length !== slotIds.size
        || [...slotIds].some((slotId) => !readingSet.has(slotId))) {
      errors.push(`${id}: page_blueprint.reading_order debe cubrir cada slot exactamente una vez.`);
    }
  }
  if (isV7) {
    const expectedRoles = MANHWA_V7_TEMPLATE_CONTENT_ROLES.get(template);
    const actualRoles = slots.map((slot) => cleanString(slot?.content_role));
    if (expectedRoles && (actualRoles.length !== expectedRoles.length
        || actualRoles.some((role, index) => role !== expectedRoles[index]))) {
      errors.push(`${id}: ${template} exige slots[].content_role exactos [${expectedRoles.join(",")}].`);
    }
  }
  if (isV7 && template === "WHITE_FOCUS_INSET" && slots.length === 2
      && slots.every((slot) => ["x", "y", "w", "h"].every((key) => finiteNumber(slot?.[key])))) {
    const [primary, detail] = slots;
    const detailInside = detail.x >= primary.x && detail.y >= primary.y
      && detail.x + detail.w <= primary.x + primary.w
      && detail.y + detail.h <= primary.y + primary.h;
    if (rectIntersection(primary, detail) <= 1e-9 || detailInside) {
      errors.push(`${id}: WHITE_FOCUS_INSET exige que el slot B cruce deliberadamente el borde del slot A.`);
    }
  }
  if (isV7 && page?.allow_overlap !== true && slots.length > 1) {
    const gutter = nonnegativeInteger(page?.gutter_px) ? page.gutter_px : 0;
    for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) {
      const left = slots[a], right = slots[b];
      if (![left, right].every((slot) => ["x", "y", "w", "h"].every((key) => finiteNumber(slot?.[key])))) continue;
      const intersection = rectIntersection(left, right);
      const dx = Math.max(0, Math.max(left.x, right.x) * V7_CANVAS_WIDTH
        - Math.min(left.x + left.w, right.x + right.w) * V7_CANVAS_WIDTH);
      const dy = Math.max(0, Math.max(left.y, right.y) * V7_CANVAS_HEIGHT
        - Math.min(left.y + left.h, right.y + right.h) * V7_CANVAS_HEIGHT);
      if (intersection > 1e-9 || Math.hypot(dx, dy) + 1e-6 < gutter) {
        errors.push(`${id}: slots ${cleanString(left.id) || a + 1} y ${cleanString(right.id) || b + 1} se solapan o no respetan gutter_px=${gutter}.`);
      }
    }
  }
  if (isV7) {
    const measuredBackground = measureManhwaV7BackgroundAreaPct(slots);
    if (measuredBackground == null) {
      errors.push(`${id}: no se pudo medir la mascara shaped/rotated V7.`);
    } else if (Array.isArray(page?.background_area_target_pct)) {
      const [minTarget, maxTarget] = page.background_area_target_pct;
      if (finiteNumber(minTarget) && finiteNumber(maxTarget)
          && (measuredBackground < minTarget - 1e-6 || measuredBackground > maxTarget + 1e-6)) {
        errors.push(`${id}: la mascara shaped/rotated deja ${measuredBackground.toFixed(2)}% de fondo, fuera de background_area_target_pct [${minTarget},${maxTarget}].`);
      }
    }
    validateV7TemplateGeometry(errors, id, template, slots, measuredBackground, page?.allow_overlap === true);
  }
}

function largestRemainderPageCounts(total) {
  const entries = [
    { key: "white", ratio: 30, order: 0 },
    { key: "black", ratio: 30, order: 1 },
    { key: "other", ratio: 40, order: 2 },
  ].map((entry) => {
    const exact = total * entry.ratio / 100;
    return { ...entry, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = total - entries.reduce((sum, entry) => sum + entry.count, 0);
  for (const entry of [...entries].sort((a, b) => b.remainder - a.remainder || a.order - b.order)) {
    if (left-- <= 0) break;
    entry.count++;
  }
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.count]));
}

function validateExactObjectKeys(errors, label, value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} debe ser un objeto.`);
    return false;
  }
  const expected = new Set(expectedKeys);
  const actual = Object.keys(value);
  for (const key of expectedKeys) if (!Object.hasOwn(value, key)) errors.push(`${label}.${key} es obligatorio.`);
  for (const key of actual) if (!expected.has(key)) errors.push(`${label}.${key} no pertenece al contrato V7 Grok-native.`);
  return expectedKeys.every((key) => Object.hasOwn(value, key)) && actual.every((key) => expected.has(key));
}

function rejectV7CompositorResidue(errors, value, path = "root") {
  if (typeof value === "string") {
    const normalized = value.replace(/\\/g, "/");
    if (value.includes("COMPOSITION_ONLY_V7_FROM_DECLARED_SLOTS")) {
      errors.push(`${path}: sentinel de compositor prohibido; visual.image_prompt debe ser el prompt natural real enviado a Grok.`);
    }
    if (normalized.includes("images/cells/") || normalized.includes("compose_pages_v7") || normalized.includes("/manhwa/compose-page")) {
      errors.push(`${path}: residuo de celdas/compositor prohibido en GROK_NATIVE_PAGE.`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectV7CompositorResidue(errors, item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (["page_blueprint", "slots", "cells", "compositor", "source_budget", "composition_manifest", "background_mask_path"].includes(key)) {
      errors.push(`${path}.${key}: campo de compositor prohibido en GROK_NATIVE_PAGE.`);
    }
    rejectV7CompositorResidue(errors, child, `${path}.${key}`);
  }
}

function validateV7ProjectContract(errors, rawJson, scenes) {
  const contract = rawJson?.v7_contract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return false;
  if (cleanString(contract.version) !== "7.0") errors.push('v7_contract.version debe ser "7.0".');
  if (cleanString(contract.generation_mode) !== "GROK_NATIVE_PAGE") {
    errors.push('v7_contract.generation_mode debe ser exactamente "GROK_NATIVE_PAGE".');
  }
  if (!["PILOT", "PRODUCTION"].includes(cleanString(contract.mode))) {
    errors.push('v7_contract.mode debe ser "PILOT" o "PRODUCTION".');
  }
  const timelineModel = cleanString(contract.timeline_model);
  if (cleanString(contract.mode) === "PRODUCTION" && timelineModel !== MANHWA_V7_TIMELINE_MODEL) {
    errors.push(`v7_contract.timeline_model debe ser exactamente "${MANHWA_V7_TIMELINE_MODEL}" en PRODUCTION.`);
  }
  if (rawJson?.pipeline?.image_generation?.tool !== "grok") {
    errors.push('pipeline.image_generation.tool debe ser exactamente "grok" en minusculas para V7; Flow no esta autorizado.');
  }
  if (rawJson?.pipeline?.animation?.tool !== "none") {
    errors.push('pipeline.animation.tool debe ser exactamente "none" para paginas estaticas V7.');
  }
  if (!contract.canvas || typeof contract.canvas !== "object" || Array.isArray(contract.canvas)
      || contract.canvas.width !== 720 || contract.canvas.height !== 1280) {
    errors.push("v7_contract.canvas debe ser exactamente {width:720,height:1280}.");
  }
  if (!contract.thresholds || typeof contract.thresholds !== "object" || Array.isArray(contract.thresholds)) {
    errors.push("v7_contract.thresholds debe ser un objeto (puede estar vacio).");
  }
  const adapter = contract.runtime_adapter;
  validateExactObjectKeys(errors, "v7_contract.runtime_adapter", adapter,
    ["grok_native_full_page", "page_blueprint_slots_integrated"]);
  if (adapter?.grok_native_full_page !== true) {
    errors.push("v7_contract.runtime_adapter.grok_native_full_page debe ser true.");
  }
  if (adapter?.page_blueprint_slots_integrated !== false) {
    errors.push("v7_contract.runtime_adapter.page_blueprint_slots_integrated debe ser false.");
  }
  const mix = contract.page_mix;
  if (!mix || typeof mix !== "object" || Array.isArray(mix)) {
    errors.push("v7_contract.page_mix es obligatorio.");
    return true;
  }
  if (cleanString(mix.basis) !== "TYPE_PANEL_ONLY") errors.push('v7_contract.page_mix.basis debe ser "TYPE_PANEL_ONLY".');
  if (cleanString(mix.method) !== "LARGEST_REMAINDER") errors.push('v7_contract.page_mix.method debe ser "LARGEST_REMAINDER".');
  const ratios = mix.ratios;
  if (!ratios || typeof ratios !== "object" || ratios.white !== 30 || ratios.black !== 30 || ratios.other !== 40) {
    errors.push("v7_contract.page_mix.ratios debe ser exactamente {white:30,black:30,other:40}.");
  }

  // Solo type:"panel" consume una solicitud Grok y una pagina nativa. narrative_card queda fuera.
  const editorial = scenes.filter((scene) => cleanString(scene?.type) === "panel");
  const expected = largestRemainderPageCounts(editorial.length);
  const declared = mix.counts;
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) {
    errors.push("v7_contract.page_mix.counts es obligatorio.");
  } else for (const key of ["white", "black", "other"]) {
    if (!Number.isInteger(declared[key]) || declared[key] < 0) errors.push(`v7_contract.page_mix.counts.${key} debe ser un entero >= 0.`);
    else if (declared[key] !== expected[key]) errors.push(`v7_contract.page_mix.counts.${key} debe ser ${expected[key]} para ${editorial.length} escenas editoriales (LARGEST_REMAINDER).`);
  }

  const actual = { white: 0, black: 0, other: 0 };
  let previousFamily = "";
  let familyRun = 0;
  let previousLayout = "";
  const templatesByFamily = new Map([
    ["WHITE_PAGE", new Set()],
    ["BLACK_PAGE", new Set()],
    ["OTHER", new Set()],
  ]);
  for (const scene of editorial) {
    const id = sceneId(scene);
    const page = scene?.visual_plan?.native_page;
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      errors.push(`${id}: V7 exige visual_plan.native_page en toda escena type:"panel".`);
      previousFamily = "";
      previousLayout = "";
      familyRun = 0;
      continue;
    }
    const family = cleanString(page.family);
    if (family === "WHITE_PAGE") actual.white++;
    else if (family === "BLACK_PAGE") actual.black++;
    else if (family === "OTHER") actual.other++;
    if (family && family === previousFamily) familyRun++;
    else familyRun = 1;
    const configuredMaxRun = contract?.thresholds?.max_same_family_run;
    const maxFamilyRun = Number.isInteger(configuredMaxRun) && configuredMaxRun > 0 ? configuredMaxRun : 2;
    if (familyRun > maxFamilyRun) errors.push(`${id}: V7 no permite mas de ${maxFamilyRun} paginas consecutivas de la familia ${family}.`);
    const layout = cleanString(page.layout);
    if (templatesByFamily.has(family) && layout) {
      templatesByFamily.get(family).add(layout);
    }
    if (layout && layout === previousLayout) errors.push(`${id}: V7 no permite el mismo layout consecutivo (${layout}).`);
    previousFamily = family;
    previousLayout = layout;
  }
  for (const key of ["white", "black", "other"]) {
    if (actual[key] !== expected[key]) {
      errors.push(`V7 page_mix real ${key}=${actual[key]}; debe ser ${expected[key]} para ${editorial.length} escenas editoriales.`);
    }
  }
  const familyCatalogSizes = { WHITE_PAGE: 6, BLACK_PAGE: 5, OTHER: 6 };
  const actualFamilyCounts = { WHITE_PAGE: actual.white, BLACK_PAGE: actual.black, OTHER: actual.other };
  for (const family of ["WHITE_PAGE", "BLACK_PAGE", "OTHER"]) {
    const requiredDistinct = Math.min(actualFamilyCounts[family], familyCatalogSizes[family]);
    const used = templatesByFamily.get(family).size;
    if (used < requiredDistinct) {
      errors.push(`V7 layout diversity ${family}: ${used} layouts distintos; requiere ${requiredDistinct} antes de repetir.`);
    }
  }
  if (cleanString(contract.mode) === "PILOT") {
    const expectedPanels = Number.isInteger(contract.pilot_panel_count) ? contract.pilot_panel_count : 10;
    if (editorial.length !== expectedPanels) errors.push(`V7 PILOT requiere ${expectedPanels} escenas type:"panel"; hay ${editorial.length}.`);
    const targetRuntime = rawJson?.project?.target_runtime_seconds;
    if (finiteNumber(targetRuntime) && targetRuntime >= 60) {
      errors.push(`V7 PILOT contradice project.target_runtime_seconds=${targetRuntime}; una entrega de 60 s o mas debe usar mode:"PRODUCTION" y 30-55 escenas type:"panel".`);
    }
  } else if (cleanString(contract.mode) === "PRODUCTION") {
    if (editorial.length < 30 || editorial.length > 55) {
      errors.push(`V7 PRODUCTION requiere 30-55 escenas type:"panel"; hay ${editorial.length}.`);
    }
    if (!Number.isInteger(contract.production_panel_count)
        || contract.production_panel_count < 30 || contract.production_panel_count > 55) {
      errors.push("v7_contract.production_panel_count debe ser un entero entre 30 y 55 en PRODUCTION.");
    } else if (editorial.length !== contract.production_panel_count) {
      errors.push(`V7 PRODUCTION declara production_panel_count=${contract.production_panel_count}, pero contiene ${editorial.length} escenas type:"panel".`);
    }
  }
  rejectV7CompositorResidue(errors, rawJson);
  return true;
}

function nativePromptNumber(value) {
  return finiteNumber(value) && Number.isInteger(value) ? String(value) : String(value);
}

function nativeExactImagePanelCountRe(panelCount) {
  const numberWord = new Map([[1, "one"], [2, "two"], [3, "three"]]).get(panelCount);
  if (!numberWord) return null;
  const noun = panelCount === 1 ? "panel" : "panels";
  // Admite especificadores editoriales entre el numero y "image panels", por ejemplo:
  // "exactly two separate thin-white-bordered image panels". El sustantivo image evita
  // que frases vagas como "one inset" vuelvan a producir las paginas ambiguas 07/12.
  return new RegExp(`\\bexactly\\s+${numberWord}(?:\\s+[a-z0-9-]+){0,8}\\s+image\\s+${noun}\\b`, "i");
}

function validateV7NativeCamera(errors, label, camera) {
  const keys = ["scale", "elevation", "viewpoint", "azimuth_deg", "lens_mm", "roll_deg", "dominant_subject", "occupancy_pct"];
  validateExactObjectKeys(errors, label, camera, keys);
  if (!camera || typeof camera !== "object" || Array.isArray(camera)) return null;
  const scale = cleanString(camera.scale);
  const elevation = cleanString(camera.elevation);
  const viewpoint = cleanString(camera.viewpoint);
  if (!MANHWA_V7_SHOT_SCALES.has(scale)) errors.push(`${label}.scale invalido "${scale || "(vacio)"}".`);
  if (!MANHWA_V7_ELEVATIONS.has(elevation)) errors.push(`${label}.elevation invalido "${elevation || "(vacio)"}".`);
  if (!MANHWA_V7_VIEWPOINTS.has(viewpoint)) errors.push(`${label}.viewpoint invalido "${viewpoint || "(vacio)"}".`);
  if (!finiteNumber(camera.azimuth_deg) || camera.azimuth_deg < 0 || camera.azimuth_deg >= 360) errors.push(`${label}.azimuth_deg debe estar entre 0 y 360 (excluido).`);
  if (!finiteNumber(camera.lens_mm) || camera.lens_mm < 8 || camera.lens_mm > 300) errors.push(`${label}.lens_mm debe estar entre 8 y 300.`);
  if (!finiteNumber(camera.roll_deg) || camera.roll_deg < -180 || camera.roll_deg > 180) errors.push(`${label}.roll_deg debe estar entre -180 y 180.`);
  if (!cleanString(camera.dominant_subject)) errors.push(`${label}.dominant_subject es obligatorio.`);
  if (!finiteNumber(camera.occupancy_pct) || camera.occupancy_pct < 0 || camera.occupancy_pct > 100) errors.push(`${label}.occupancy_pct debe estar entre 0 y 100.`);
  return camera;
}

function validateV7NaturalCameraLanguage(errors, label, fragment, camera) {
  const folded = cleanString(fragment).toLocaleLowerCase();
  for (const dimension of ["scale", "elevation", "viewpoint"]) {
    const terms = MANHWA_V7_NATIVE_CAMERA_TERMS[dimension].get(cleanString(camera?.[dimension])) || [];
    if (!terms.some((term) => folded.includes(term))) {
      errors.push(`${label}: prompt_fragment no expresa ${dimension}=${cleanString(camera?.[dimension])} con lenguaje natural.`);
    }
  }
  if (finiteNumber(camera?.roll_deg) && Math.abs(camera.roll_deg) < 10) {
    if (!folded.includes("level camera roll") && !folded.includes("level horizon")) {
      errors.push(`${label}: roll casi nivelado exige "level camera roll" o "level horizon".`);
    }
  } else if (finiteNumber(camera?.roll_deg)
      && !folded.includes("dutch angle") && !folded.includes("dutch tilt") && !folded.includes("camera roll")) {
    errors.push(`${label}: roll expresivo exige Dutch angle/tilt o camera roll.`);
  }
  if (finiteNumber(camera?.lens_mm)) {
    const lensA = `${camera.lens_mm}mm lens`.toLocaleLowerCase();
    const lensB = `${camera.lens_mm} mm lens`.toLocaleLowerCase();
    if (!folded.includes(lensA) && !folded.includes(lensB)) errors.push(`${label}: falta lente natural ${camera.lens_mm}mm lens.`);
  }
}

function nativeCameraChangeCount(previous, current) {
  let changes = 0;
  for (const key of ["scale", "elevation", "viewpoint", "dominant_subject"]) if (!sameToken(previous?.[key], current?.[key])) changes++;
  if (angularDistance(previous?.azimuth_deg, current?.azimuth_deg) >= 20) changes++;
  if (finiteNumber(previous?.lens_mm) && finiteNumber(current?.lens_mm) && Math.abs(previous.lens_mm - current.lens_mm) >= 15) changes++;
  if (finiteNumber(previous?.roll_deg) && finiteNumber(current?.roll_deg) && Math.abs(previous.roll_deg - current.roll_deg) >= 10) changes++;
  return changes;
}

function nativeCameraKey(camera) {
  return ["scale", "elevation", "viewpoint", "azimuth_deg", "lens_mm", "roll_deg", "dominant_subject"]
    .map((key) => String(camera?.[key] ?? "")).join("\u0000");
}

function sceneCharacterPoseMap(references) {
  const result = new Map();
  const refs = references && typeof references === "object" && !Array.isArray(references) ? references : {};
  for (const raw of [...(Array.isArray(refs.characters) ? refs.characters : []), ...(Array.isArray(refs.assets) ? refs.assets : [])]) {
    const id = typeof raw === "string" ? cleanString(raw) : cleanString(raw?.id) || cleanString(raw?.character_id) || cleanString(raw?.asset_id);
    const pose = typeof raw === "string" ? "" : cleanString(raw?.pose) || "base";
    if (id && pose) result.set(id, pose);
  }
  return result;
}

function validateV7NativePrompt(errors, label, prompt, nativePage, shots, references, context) {
  const text = typeof prompt === "string" ? prompt : "";
  const folded = text.toLocaleLowerCase();
  if (!text.trim()) errors.push(`${label}: image_prompt natural en ingles requerido.`);
  const physicalLines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  const machineSevenBlock = physicalLines.length === MANHWA_V7_PROMPT_BLOCKS.length
    && MANHWA_V7_PROMPT_BLOCKS.every((name, index) => physicalLines[index]?.startsWith(`${name}:`));
  if (machineSevenBlock) errors.push(`${label}: GROK_NATIVE_PAGE prohibe el formato machine de siete bloques; usa prosa de pagina completa.`);
  const shortcut = text.match(MANHWA_V7_RELATIVE_SCENARIO_RE);
  if (shortcut) errors.push(`${label}: atajo ambiental relativo prohibido "${shortcut[0]}"; describe el lugar de forma absoluta.`);
  for (const token of MANHWA_V7_NATIVE_NEGATIVE_TOKENS) {
    if (!folded.includes(token)) errors.push(`${label}: token negativo literal obligatorio ausente: ${token}.`);
  }

  const family = cleanString(nativePage?.family);
  const layout = cleanString(nativePage?.layout);
  const backgroundPct = nativePage?.background_pct;
  const pct = nativePromptNumber(backgroundPct);
  if (family === "WHITE_PAGE") {
    if (!folded.includes("pure white webtoon page")) errors.push(`${label}: WHITE_PAGE exige literalmente "Pure white webtoon page".`);
    const phraseA = `white space occupying ${pct}% of the canvas`.toLocaleLowerCase();
    const phraseB = `${pct}% untouched white space`.toLocaleLowerCase();
    if (!folded.includes(phraseA) && !folded.includes(phraseB)) errors.push(`${label}: WHITE_PAGE debe expresar exactamente ${pct}% de blanco.`);
  } else if (family === "BLACK_PAGE") {
    if (!folded.includes("matte-black webtoon page")) errors.push(`${label}: BLACK_PAGE exige literalmente "Matte-black webtoon page".`);
    if (!folded.includes(`black space occupying ${pct}% of the canvas`.toLocaleLowerCase())) {
      errors.push(`${label}: BLACK_PAGE debe expresar exactamente ${pct}% de negro.`);
    }
  } else if (family === "OTHER") {
    if (folded.includes("pure white webtoon page") || folded.includes("matte-black webtoon page")
        || /(?:white|black)\s+space\s+occupying/i.test(text)) {
      errors.push(`${label}: OTHER no puede declarar una pagina WHITE/BLACK ni espacio reservado.`);
    }
  }
  const layoutDef = MANHWA_V7_NATIVE_PAGE_LAYOUTS.get(layout);
  if (layoutDef?.anchor && !folded.includes(layoutDef.anchor.toLocaleLowerCase())) {
    errors.push(`${label}: layout ${layout} exige literalmente "${layoutDef.anchor}".`);
  }
  const composition = nativePage?.composition;
  if (typeof composition === "string" && composition.trim() && !text.includes(composition)) {
    errors.push(`${label}: native_page.composition debe aparecer literal en image_prompt.`);
  }
  const panelCount = nativePage?.panel_count;
  const exactPanelCountRe = nativeExactImagePanelCountRe(panelCount);
  if (exactPanelCountRe) {
    const numberWord = new Map([[1, "one"], [2, "two"], [3, "three"]]).get(panelCount);
    const requiredPhrase = `exactly ${numberWord} ... image panel${panelCount === 1 ? "" : "s"}`;
    if (typeof composition !== "string" || !exactPanelCountRe.test(composition)) {
      errors.push(`${label}: native_page.composition debe declarar inequívocamente "${requiredPhrase}"; "one inset" por si solo no cuenta.`);
    }
    if (!exactPanelCountRe.test(text)) {
      errors.push(`${label}: image_prompt debe declarar inequívocamente "${requiredPhrase}".`);
    }
  }

  const poseByCharacter = sceneCharacterPoseMap(references);
  const expectedLabels = shots.map((_, index) => String.fromCharCode(65 + index));
  for (const [index, shot] of shots.entries()) {
    const shotLabel = `${label}.shots[${index}]`;
    const fragment = cleanString(shot?.prompt_fragment);
    if (!fragment) continue;
    if (!text.includes(fragment)) errors.push(`${shotLabel}.prompt_fragment debe aparecer literal en image_prompt.`);
    if (shots.length > 1 && !fragment.startsWith(`Panel ${expectedLabels[index]}:`)) {
      errors.push(`${shotLabel}.prompt_fragment: pagina multipanel exige prefijo exacto "Panel ${expectedLabels[index]}:".`);
    }
    validateV7NaturalCameraLanguage(errors, `${shotLabel}.prompt_fragment`, fragment, shot.camera);
    for (const entityId of Array.isArray(shot.visible_entities) ? shot.visible_entities : []) {
      const character = context.manhwaChars[entityId];
      if (!character) continue;
      const signature = cleanString(character.prompt_signature);
      if (signature && !fragment.includes(signature)) errors.push(`${shotLabel}.prompt_fragment: falta prompt_signature fisica completa de ${entityId}; el nombre no basta.`);
      const pose = poseByCharacter.get(entityId);
      const performance = pose ? character?.poses?.[pose]?.performance_signature : null;
      for (const field of MANHWA_V7_PERFORMANCE_FIELDS) {
        const value = cleanString(performance?.[field]);
        if (value && !fragment.includes(value)) errors.push(`${shotLabel}.prompt_fragment: falta performance_signature.${field} de ${entityId}/${pose}: "${value}".`);
      }
      for (const invariant of stringArray(character.negative_invariants)) {
        if (!text.includes(invariant)) errors.push(`${label}: falta negative_invariant literal de ${entityId}: "${invariant}".`);
      }
    }
    const locationId = cleanString(shot.location_id);
    const viewId = cleanString(shot.view_id);
    const scenario = context.escenarios[locationId];
    const rootSignature = cleanString(scenario?.prompt_signature);
    const viewSignature = cleanString(scenario?.views?.[viewId]?.prompt_signature);
    if (rootSignature && !fragment.includes(rootSignature)) errors.push(`${shotLabel}.prompt_fragment: falta prompt_signature raiz de escenarios.${locationId}.`);
    if (viewSignature && !fragment.includes(viewSignature)) errors.push(`${shotLabel}.prompt_fragment: falta prompt_signature de escenarios.${locationId}.views.${viewId}.`);
  }
}

function validateV7TtsContract(errors, rawJson, scenes) {
  const tts = rawJson?.tts_export;
  if (!tts || typeof tts !== "object" || Array.isArray(tts)) {
    errors.push("V7 exige tts_export objeto.");
    return;
  }
  if (!cleanString(tts.language)) errors.push("tts_export.language es obligatorio en V7.");
  else if (cleanString(tts.language) !== cleanString(rawJson?.project?.language)) errors.push("tts_export.language debe coincidir exactamente con project.language.");
  if (cleanString(tts.mode) !== "dialogue") errors.push('tts_export.mode debe ser exactamente "dialogue" en V7.');
  if (!cleanString(tts.model_id)) errors.push("tts_export.model_id es obligatorio en V7.");
  for (const key of ["elevenlabs_speed", "edit_speed"]) {
    if (!finiteNumber(tts[key]) || tts[key] <= 0) errors.push(`tts_export.${key} debe ser numerico y >0 en V7.`);
  }
  if (!tts.voices || typeof tts.voices !== "object" || Array.isArray(tts.voices) || !Object.keys(tts.voices).length) {
    errors.push("tts_export.voices debe ser un objeto no vacio en V7.");
  }
  if (Object.hasOwn(tts, "voice_id")) errors.push("tts_export.voice_id singular esta prohibido en V7; usa voices{}.");
  if (Object.hasOwn(rawJson, "full_script")) errors.push("full_script en raiz esta prohibido en V7; usa tts_export.full_script.");

  const decoupled = cleanString(rawJson?.v7_contract?.timeline_model) === MANHWA_V7_TIMELINE_MODEL;
  let expected = [];
  if (decoupled) {
    const track = rawJson?.narration_track;
    validateExactObjectKeys(errors, "narration_track", track,
      ["version", "canonicalization", "join", "unit_count", "units"]);
    if (track?.version !== "1.0") errors.push('narration_track.version debe ser exactamente "1.0".');
    if (track?.canonicalization !== MANHWA_V7_NARRATION_CANONICALIZATION) {
      errors.push(`narration_track.canonicalization debe ser exactamente "${MANHWA_V7_NARRATION_CANONICALIZATION}".`);
    }
    if (track?.join !== "LF") errors.push('narration_track.join debe ser exactamente "LF".');
    const units = Array.isArray(track?.units) ? track.units : [];
    if (!Array.isArray(track?.units)) errors.push("narration_track.units debe ser un array.");
    if (!Number.isInteger(track?.unit_count) || track.unit_count !== units.length) {
      errors.push(`narration_track.unit_count debe coincidir con units.length=${units.length}.`);
    }
    const unitById = new Map();
    for (const [index, unit] of units.entries()) {
      const label = `narration_track.units[${index}]`;
      validateExactObjectKeys(errors, label, unit, ["id", "speaker", "text"]);
      const id = cleanString(unit?.id);
      if (!id || !SAFE_REF_ID.test(id)) errors.push(`${label}.id debe ser un ID seguro.`);
      else if (unitById.has(id)) errors.push(`${label}.id duplicado "${id}".`);
      const speaker = cleanString(unit?.speaker);
      if (!speaker) errors.push(`${label}.speaker es obligatorio.`);
      if (typeof unit?.text !== "string" || !unit.text.trim()) errors.push(`${label}.text es obligatorio.`);
      else if (/[\r\n]/.test(unit.text)) errors.push(`${label}.text representa una sola linea y no puede contener CR/LF.`);
      if (id) unitById.set(id, unit);
    }
    const pagesByUnit = new Map([...unitById.keys()].map((id) => [id, []]));
    for (const scene of scenes) {
      if (scene?.type !== "panel") continue;
      const id = sceneId(scene);
      if (Object.hasOwn(scene || {}, "voiceover") || Object.hasOwn(scene || {}, "captions")) {
        errors.push(`${id}: ${MANHWA_V7_TIMELINE_MODEL} mantiene voz y captions en narration_track; la pagina visual no debe duplicarlos.`);
      }
      const ref = scene?.narration_ref;
      validateExactObjectKeys(errors, `${id}.narration_ref`, ref, ["unit_id", "timing_weight"]);
      const unitId = cleanString(ref?.unit_id);
      if (!unitById.has(unitId)) errors.push(`${id}.narration_ref.unit_id apunta a una unidad inexistente "${unitId || "(vacio)"}".`);
      if (!finiteNumber(ref?.timing_weight) || ref.timing_weight <= 0) {
        errors.push(`${id}.narration_ref.timing_weight debe ser numerico y >0.`);
      }
      if (pagesByUnit.has(unitId)) pagesByUnit.get(unitId).push(id);
    }
    for (const unit of units) {
      const owned = pagesByUnit.get(cleanString(unit?.id)) || [];
      if (!owned.length) errors.push(`narration_track.units[${cleanString(unit?.id) || "?"}] no posee ninguna pagina visual.`);
      expected.push({ scene_id: owned[0] || "", speaker: cleanString(unit?.speaker), text: unit?.text });
    }
    const reconstructed = units.map((unit) => unit?.text ?? "").join("\n");
    if (tts.full_script !== reconstructed) {
      errors.push("tts_export.full_script debe ser el join LF byte-exacto de narration_track.units[].text.");
    }
  } else {
    for (const scene of scenes) {
      if (scene?.type !== "panel") continue;
      const hasVoiceover = Object.hasOwn(scene || {}, "voiceover");
      const hasCaptions = Object.hasOwn(scene || {}, "captions");
      if (hasVoiceover !== hasCaptions) {
        errors.push(`${sceneId(scene)}: una pagina V7 hablada debe declarar juntos voiceover y captions; una pagina silenciosa omite ambos.`);
        continue;
      }
      if (!hasVoiceover) continue;
      const voiceText = cleanString(scene?.voiceover?.text);
      const speaker = cleanString(scene?.voiceover?.speaker);
      if (!voiceText) errors.push(`${sceneId(scene)}: voiceover.text no puede estar vacio cuando se declara voiceover.`);
      if (!speaker) errors.push(`${sceneId(scene)}: voiceover.speaker no puede estar vacio cuando se declara voiceover.`);
      if (scene?.captions?.text !== scene?.voiceover?.text) {
        errors.push(`${sceneId(scene)}: captions.text debe coincidir exactamente con voiceover.text.`);
      }
    }
    expected = scenes.filter((scene) => cleanString(scene?.voiceover?.text)).map((scene) => ({
      scene_id: sceneId(scene),
      speaker: cleanString(scene?.voiceover?.speaker),
      text: scene.voiceover.text,
    }));
  }
  const dialogue = Array.isArray(tts.dialogue) ? tts.dialogue : [];
  if (dialogue.length !== expected.length) {
    errors.push(`tts_export.dialogue debe tener exactamente ${expected.length} rows (una por scene con voiceover), tiene ${dialogue.length}.`);
  }
  for (let i = 0; i < Math.min(dialogue.length, expected.length); i++) {
    const row = dialogue[i] || {};
    const wanted = expected[i];
    if (cleanString(row.scene_id) !== wanted.scene_id) errors.push(`tts_export.dialogue[${i}].scene_id debe ser exactamente "${wanted.scene_id}" y conservar orden.`);
    if (cleanString(row.speaker) !== wanted.speaker) errors.push(`tts_export.dialogue[${i}].speaker no coincide exactamente con ${wanted.scene_id}.voiceover.speaker.`);
    if (row.text !== wanted.text) errors.push(`tts_export.dialogue[${i}].text no coincide exactamente con ${wanted.scene_id}.voiceover.text.`);
  }
  const expectedScript = expected.map((row) => row.text).join("\n");
  if (tts.full_script !== expectedScript) errors.push("tts_export.full_script debe ser el join LF exacto de dialogue[].text.");
}

function providerFromAnimationTool(tool) {
  const t = cleanString(tool).toLowerCase();
  if (!t || t === "none") return t || null;
  if (t === "grok" || t === "grok_video" || t === "grok-video" || t.startsWith("grok_")) return "grok";
  if (t === "flow") return "flow";
  return null;
}

function ingredientId(ing) {
  return cleanString(ing?.id) || cleanString(ing?.ingredient_id);
}

function ingredientRefIds(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.map((r) => (typeof r === "string" ? r : cleanString(r?.ingredient_id) || cleanString(r?.id))).filter(Boolean);
}

function safeAssetPath(rel) {
  const p = cleanString(rel).replace(/\\/g, "/");
  return !!p && !p.includes("..") && /^assets\/characters\/[^/]+\.(png|jpg|jpeg|webp)$/i.test(p);
}

function characterAssetExists(rel, fileExists) {
  if (!fileExists) return true;
  if (fileExists(rel)) return true;
  const m = cleanString(rel).match(/^(.*)\.(png|jpg|jpeg|webp)$/i);
  if (!m) return false;
  return ["png", "jpg", "jpeg", "webp"].some((ext) => fileExists(`${m[1]}.${ext}`));
}

function validateCharacterAsset(errors, label, rel, fileExists) {
  if (!safeAssetPath(rel)) {
    errors.push(`${label}: reference_asset debe apuntar a assets/characters/*.png|jpg|jpeg|webp.`);
    return;
  }
  if (!characterAssetExists(rel, fileExists)) errors.push(`${label}: no existe ${rel} ni variante .png/.jpg/.jpeg/.webp con el mismo nombre.`);
}

function safeManhwaAssetPath(rel, bucket) {
  const p = cleanString(rel).replace(/\\/g, "/");
  const root = bucket === "escenarios" ? "escenarios" : "characters";
  return !!p && !p.includes("..") && new RegExp(`^assets/${root}/[^/]+/[^/]+\\.(png|jpg|jpeg|webp)$`, "i").test(p);
}

function validateManhwaAsset(errors, label, rel, bucket, fileExists, serie = "") {
  const normalized = cleanString(rel).replace(/\\/g, "/");
  if (!safeManhwaAssetPath(rel, bucket)) {
    errors.push(`${label}: debe apuntar a assets/${bucket}/<serie>/<archivo>.png|jpg|jpeg|webp.`);
    return;
  }
  if (serie && !normalized.startsWith(`assets/${bucket}/${serie}/`)) errors.push(`${label}: debe vivir bajo assets/${bucket}/${serie}/.`);
  if (fileExists && !characterAssetExists(rel, fileExists)) errors.push(`${label}: no existe ${rel} ni variante .png/.jpg/.jpeg/.webp con el mismo nombre.`);
}

function stringArray(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
}

function manhwaAssetDef(v) {
  if (typeof v === "string") return { mode: "existing", asset: cleanString(v), prompt: "", referenceKey: "", referenceAssets: [] };
  if (!v || typeof v !== "object" || Array.isArray(v)) return { mode: "", asset: "", prompt: "", referenceKey: "", referenceAssets: [] };
  const prompt = cleanString(v.prompt) || cleanString(v.generation_prompt) || cleanString(v.image_prompt);
  return {
    mode: cleanString(v.mode) || (prompt ? "generate" : "existing"),
    asset: cleanString(v.asset) || cleanString(v.reference_asset) || cleanString(v.output_file),
    prompt,
    referenceKey: cleanString(v.reference_pose) || cleanString(v.reference_view),
    referenceAssets: stringArray(v.reference_assets),
  };
}

function validateManhwaAssetDef(errors, label, raw, bucket, fileExists, serie) {
  const def = manhwaAssetDef(raw);
  if (!["existing", "generate"].includes(def.mode)) errors.push(`${label}: mode debe ser "existing" o "generate".`);
  validateManhwaAsset(errors, `${label}.asset`, def.asset, bucket, def.mode === "existing" ? fileExists : null, serie);
  if (def.mode === "generate" && !def.prompt) errors.push(`${label}: mode "generate" requiere prompt.`);
  for (const [i, rel] of def.referenceAssets.entries()) {
    validateManhwaAsset(errors, `${label}.reference_assets[${i}]`, rel, bucket, fileExists, serie);
  }
  return def;
}

function manhwaEscenarioViews(e) {
  const views = {};
  if (typeof e?.reference_asset === "string") views.base = e.reference_asset;
  if (e?.views && typeof e.views === "object" && !Array.isArray(e.views)) Object.assign(views, e.views);
  return views;
}

function manhwaEscenarioRef(v) {
  if (typeof v === "string") return { id: cleanString(v), view: "base" };
  if (!v || typeof v !== "object") return { id: "", view: "" };
  return { id: cleanString(v.id), view: cleanString(v.view) || "base" };
}

function hasAssetGraphSchema(rawJson) {
  const chars = rawJson?.characters && typeof rawJson.characters === "object" && !Array.isArray(rawJson.characters) ? rawJson.characters : {};
  const hasPoses = Object.values(chars).some((c) => c?.poses && typeof c.poses === "object" && !Array.isArray(c.poses));
  const hasEscenarios = rawJson?.escenarios && typeof rawJson.escenarios === "object" && !Array.isArray(rawJson.escenarios)
    && Object.keys(rawJson.escenarios).length > 0;
  return hasPoses || hasEscenarios;
}

function projectSerie(rawProject) {
  return cleanString(rawProject?.serie) || cleanString(rawProject?.series?.id);
}

function safeSlug(slug, allowPath = false) {
  if (!slug || slug.includes("..") || slug.includes("\\") || slug.startsWith("/") || slug.endsWith("/")) return false;
  if (!allowPath) return SAFE_ID.test(slug);
  return slug.split("/").every((part) => SAFE_SLUG_SEGMENT.test(part));
}

export function validateQueueProject(rawJson, options = {}) {
  const errors = [];
  const warnings = [];
  const parsed = parseProject(rawJson);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors || ["JSON invalido."], warnings, parsed: null };
  }

  const rawProject = rawJson?.project || {};
  const preset = cleanString(rawProject.preset);
  const isManhwa = preset === "manhwa";
  // Opt-in acotado para comparar el mismo JSON manhwa entre Grok y Flow. No relaja el contrato normal:
  // solo proyectos marcados explicitamente como experimento image-only pueden enrutar imagen/animacion
  // a Flow, y la UI debe ejecutar START_IMAGES (nunca RUN_ALL) para no consumir audio o video.
  const isFlowImageComparison = isManhwa
    && cleanString(rawProject.comparison_variant).toLowerCase() === "flow_images_only";
  const isManhwaV7 = isManhwa && rawJson?.v7_contract && typeof rawJson.v7_contract === "object"
    && !Array.isArray(rawJson.v7_contract);
  const isNovelaV2 = NOVELA_PRESETS.has(preset) && hasAssetGraphSchema(rawJson);
  const usesAssetGraph = isManhwa || isNovelaV2;
  const continuousPreset = CONTINUOUS_PRESET_RE.test(preset) || isManhwa;
  const classicPreset = CLASSIC_PRESETS.has(preset);
  const slug = cleanString(rawProject.slug) || parsed.project.slug;
  if (parsed.warnings?.length) {
    if (classicPreset || isManhwa) warnings.push(...parsed.warnings);
    else errors.push(...parsed.warnings.map((w) => `warning fatal: ${w}`));
  }
  if (!preset || !ALLOWED_PRESETS.has(preset)) errors.push(`preset no permitido para cola: "${preset || "(vacio)"}".`);
  if (!safeSlug(slug, classicPreset)) errors.push(`project.slug invalido: "${slug || "(vacio)"}". Usa minusculas, numeros, _ o -${classicPreset ? " y / para subcarpetas" : ""}.`);
  if (!cleanString(rawProject.title)) errors.push("project.title es obligatorio.");
  if (!VALID_ASPECTS.has(cleanString(rawProject.aspect_ratio))) errors.push(`project.aspect_ratio invalido: "${rawProject.aspect_ratio || ""}".`);

  const imageTool = cleanString(rawJson?.pipeline?.image_generation?.tool).toLowerCase();
  if (usesAssetGraph && imageTool !== "grok" && !(isFlowImageComparison && imageTool === "flow")) {
    errors.push(`${isManhwa ? "manhwa" : "novela-coreana v2"} requiere pipeline.image_generation.tool "grok" (actual: "${imageTool || "(vacio)"}").`);
  } else if (continuousPreset && imageTool !== "grok" && !isFlowImageComparison) {
    errors.push(`Presets de voz continua requieren pipeline.image_generation.tool "grok" (actual: "${imageTool || "(vacio)"}").`);
  } else if (classicPreset && !["flow", "grok"].includes(imageTool)) {
    errors.push(`Presets clasicos requieren pipeline.image_generation.tool "flow" o "grok" (actual: "${imageTool || "(vacio)"}").`);
  }

  const scenes = Array.isArray(rawJson?.scenes) ? rawJson.scenes : [];
  const sceneIds = scenes.map(sceneId);
  const sceneSet = new Set();
  for (const [i, id] of sceneIds.entries()) {
    if (!id || !SAFE_ID.test(id)) errors.push(`scene[${i}]: id/scene_id invalido "${id || "(vacio)"}".`);
    if (sceneSet.has(id)) errors.push(`scene[${i}]: id duplicado "${id}".`);
    sceneSet.add(id);
  }
  if (isManhwaV7) {
    validateV7ProjectContract(errors, rawJson, scenes);
    validateV7TtsContract(errors, rawJson, scenes);
  }

  const hasAnimated = scenes.some((s) => s?.render_mode === "animated");
  const animationTool = rawJson?.pipeline?.animation?.tool;
  const animationProvider = providerFromAnimationTool(animationTool);
  if (isFlowImageComparison) {
    const explicitlyNoAnimation = cleanString(animationTool).toLowerCase() === "none";
    if (imageTool !== "flow" || (!explicitlyNoAnimation && animationProvider !== "flow")) {
      errors.push(`comparison_variant flow_images_only requiere imagen "flow" y animacion "none" o "flow" (actual: "${imageTool || "(vacio)"}"/"${animationTool || "(vacio)"}").`);
    }
  } else if (classicPreset) {
    if (!["flow", "grok"].includes(animationProvider || "")) {
      errors.push(`Presets clasicos requieren pipeline.animation.tool "flow" o "grok" (actual: "${animationTool || "(vacio)"}").`);
    } else if (imageTool === "grok" && animationProvider === "flow") {
      errors.push("Handoff imagen=grok -> animacion=flow no soportado; usa grok/grok o flow/grok.");
    }
  } else if (hasAnimated && animationProvider !== "grok") {
    errors.push(`Escenas animated requieren pipeline.animation.tool grok/grok_video (actual: "${animationTool || "(vacio)"}").`);
  } else if (!hasAnimated && animationTool && !["grok", "none", null].includes(animationProvider)) {
    errors.push(`pipeline.animation.tool no permitido en modo Grok: "${animationTool}".`);
  }
  for (const s of scenes) {
    if (s?.render_mode === "animated") {
      const prompt = cleanString(s?.animation_prompt) || cleanString(s?.animation?.prompt) || cleanString(s?.visual?.animation_prompt);
      if (!prompt) errors.push(`${sceneId(s)}: render_mode animated requiere animation_prompt, animation.prompt o visual.animation_prompt.`);
    }
  }

  const order = getClipOrder(rawJson);
  const hasRenderOrder = Array.isArray(rawJson?.render_export?.clip_order) && rawJson.render_export.clip_order.length > 0;
  const hasCapcutOrder = Array.isArray(rawJson?.capcut_export?.clip_order) && rawJson.capcut_export.clip_order.length > 0;
  if (!hasRenderOrder && !hasCapcutOrder && !isManhwa && !isNovelaV2) {
    errors.push("render_export.clip_order o capcut_export.clip_order es obligatorio y no puede estar vacio.");
  }
  const orderSet = new Set(order);
  if (orderSet.size !== order.length) errors.push("render_export.clip_order tiene escenas duplicadas.");
  for (const id of order) if (!sceneSet.has(id)) errors.push(`render_export.clip_order apunta a escena inexistente: "${id}".`);
  for (const id of sceneIds) if (!orderSet.has(id)) errors.push(`render_export.clip_order no incluye la escena: "${id}".`);

  const byId = new Map(scenes.map((s) => [sceneId(s), s]));
  if (!isManhwaV7) {
    for (const id of order) {
      if (!normalizeText(byId.get(id)?.voiceover?.text)) errors.push(`${id}: voiceover.text es obligatorio.`);
    }
  }
  const joinedScript = normalizeText(order.map((id) => byId.get(id)?.voiceover?.text || "").join(" "));
  const fullScript = normalizeText(rawJson?.tts_export?.full_script);
  if (continuousPreset) {
    if (!fullScript) errors.push("tts_export.full_script es obligatorio.");
    else if (joinedScript && fullScript !== joinedScript) errors.push("tts_export.full_script no coincide con la union de voiceover.text en render_export.clip_order.");
  }
  if (continuousPreset && cleanString(rawJson?.tts_export?.mode).toLowerCase() === "dialogue") {
    const dialogue = Array.isArray(rawJson?.tts_export?.dialogue) ? rawJson.tts_export.dialogue : [];
    const voiceKeys = new Set(["narrador", "voz_general", "general", "sistema", "system", "ia", "ai", ...Object.keys(rawJson?.tts_export?.voices || {})]);
    for (const [i, row] of dialogue.entries()) {
      const sid = cleanString(row?.scene_id) || cleanString(row?.id);
      const speaker = cleanString(row?.speaker) || "narrador";
      if (sid && !sceneSet.has(sid)) errors.push(`tts_export.dialogue[${i}]: scene_id inexistente "${sid}".`);
      else if (sid) {
        const sceneText = normalizeText(byId.get(sid)?.voiceover?.text);
        const rowText = normalizeText(row?.text);
        if (sceneText && rowText && sceneText !== rowText) errors.push(`tts_export.dialogue[${i}]: text no coincide con ${sid}.voiceover.text.`);
      }
      if (!voiceKeys.has(speaker)) errors.push(`tts_export.dialogue[${i}]: speaker "${speaker}" no esta en tts_export.voices.`);
      if (!cleanString(row?.text)) errors.push(`tts_export.dialogue[${i}]: falta text.`);
    }
    if (!dialogue.length) {
      for (const [i, s] of scenes.entries()) {
        const speaker = cleanString(s?.voiceover?.speaker);
        if (speaker && !voiceKeys.has(speaker)) errors.push(`scene[${i}]: voiceover.speaker "${speaker}" no esta en tts_export.voices.`);
      }
    }
  }

  if (preset === "habitos_finanzas") {
    if (!Array.isArray(rawJson.ingredients) || rawJson.ingredients.length === 0) errors.push("habitos_finanzas requiere ingredients[] no vacio.");
    const ingById = new Map(Array.isArray(rawJson.ingredients) ? rawJson.ingredients.map((ing) => [ingredientId(ing), ing]) : []);
    ingById.delete("");
    for (const [i, ing] of Array.isArray(rawJson.ingredients) ? rawJson.ingredients.entries() : []) {
      const iid = ingredientId(ing);
      if (!iid || !SAFE_ID.test(iid)) errors.push(`ingredients[${i}]: ingredient_id/id invalido.`);
      if (ing?.type === "character") validateCharacterAsset(errors, `ingredients[${i}] (${iid})`, ing.reference_asset, options.fileExists);
    }
    for (const s of scenes) {
      const refs = ingredientRefIds(s?.references?.ingredients);
      if (refs.length === 0) errors.push(`${sceneId(s)}: habitos_finanzas requiere references.ingredients.`);
      for (const rid of refs) if (!ingById.has(rid)) errors.push(`${sceneId(s)}: references.ingredients apunta a ingrediente inexistente "${rid}".`);
    }
  }

  if (usesAssetGraph) {
    const label = isManhwa ? "manhwa" : "novela-coreana v2";
    const serie = projectSerie(rawProject);
    if (!SAFE_ID.test(serie)) errors.push(`${label} requiere project.serie o project.series.id valido (actual: "${rawProject.serie || rawProject.series?.id || "(vacio)"}").`);
    const ttsTool = cleanString(rawJson?.pipeline?.tts?.tool).toLowerCase();
    if (isManhwa && ttsTool && ttsTool !== "elevenlabs") errors.push(`manhwa requiere pipeline.tts.tool "elevenlabs" (actual: "${ttsTool}").`);
    if (isNovelaV2 && ttsTool && !["fish", "fish_audio", "fishaudio"].includes(ttsTool)) errors.push(`novela-coreana v2 mantiene Fish Audio; no uses pipeline.tts.tool "${ttsTool}".`);
    if (isNovelaV2 && cleanString(rawJson?.tts_export?.mode).toLowerCase() === "dialogue") errors.push("novela-coreana v2 usa una sola voz Fish; no uses tts_export.mode dialogue.");

    const manhwaChars = rawJson?.characters && typeof rawJson.characters === "object" && !Array.isArray(rawJson.characters) ? rawJson.characters : {};
    const escenarios = rawJson?.escenarios && typeof rawJson.escenarios === "object" && !Array.isArray(rawJson.escenarios) ? rawJson.escenarios : {};
    if (isManhwa && rawJson?.ingredients != null && !Array.isArray(rawJson.ingredients)) {
      errors.push("manhwa: ingredients debe ser un array; un objeto/mapa es ignorado por el runtime.");
    }
    const runtimeIngredients = Array.isArray(rawJson?.ingredients) ? rawJson.ingredients : [];
    const runtimeIngredientIds = new Set(runtimeIngredients.map(ingredientId).filter(Boolean));
    if (isManhwa) for (const [ingredientIndex, ingredient] of runtimeIngredients.entries()) {
      const type = cleanString(ingredient?.type);
      const output = cleanString(ingredient?.output_file) || cleanString(ingredient?.reference_asset);
      const bucket = type === "character" || type === "character_edited" ? "characters"
        : type === "location_plate" ? "escenarios" : "ingredients";
      const normalized = output.replace(/\\/g, "/");
      const expectedPrefix = `assets/${bucket}/${serie}/`;
      if (!normalized.startsWith(expectedPrefix) || !/\.(png|jpg|jpeg|webp)$/i.test(normalized) || normalized.includes("..")) {
        errors.push(`ingredients[${ingredientIndex}] (${ingredientId(ingredient) || "?"}): output_file debe vivir bajo ${expectedPrefix}.`);
      }
    }
    const poseDefs = new Map();
    const escenarioViewDefs = new Map();
    const escenarioCameraDefs = new Map();
    const escenarioRoles = new Map();
    const referencedGeometryViews = new Map();
    const referencedGeometryViewSequence = new Map();
    const characterPoseUsage = new Map();
    const characterPoseSequence = new Map();
    let v7ScenarioRefCount = 0;
    let v7IdentityOnlyRefCount = 0;

    for (const [cid, c] of Object.entries(manhwaChars)) {
      const characterSignature = cleanString(c?.prompt_signature);
      const negativeInvariants = stringArray(c?.negative_invariants);
      if (isManhwaV7) {
        if (!characterSignature) errors.push(`characters.${cid}.prompt_signature es obligatorio.`);
        validateV7DescriptorProfile(errors, `characters.${cid}`, c?.descriptor_profile,
          MANHWA_V7_CHARACTER_DESCRIPTOR_FIELDS, characterSignature);
        if (!Array.isArray(c?.negative_invariants) || !negativeInvariants.length
            || negativeInvariants.length !== c.negative_invariants.length) {
          errors.push(`characters.${cid}.negative_invariants debe ser un array no vacio de textos.`);
        }
      }
      const poses = c?.poses && typeof c.poses === "object" && !Array.isArray(c.poses) ? c.poses : null;
      if (!poses || Object.keys(poses).length === 0) errors.push(`characters.${cid}: ${label} requiere poses{} no vacio.`);
      const performanceKeys = new Set();
      for (const [pose, rel] of Object.entries(poses || {})) {
        const def = validateManhwaAssetDef(errors, `characters.${cid}.poses.${pose}`, rel, "characters", options.fileExists, serie);
        poseDefs.set(`${cid}:${pose}`, def);
        if (isManhwaV7) {
          const performance = rel?.performance_signature;
          const fragments = [];
          if (!performance || typeof performance !== "object" || Array.isArray(performance)) {
            errors.push(`characters.${cid}.poses.${pose}.performance_signature es obligatorio.`);
          } else for (const field of MANHWA_V7_PERFORMANCE_FIELDS) {
            const value = cleanString(performance[field]);
            if (!value) errors.push(`characters.${cid}.poses.${pose}.performance_signature.${field} es obligatorio.`);
            else fragments.push(value);
          }
          if (fragments.length === MANHWA_V7_PERFORMANCE_FIELDS.length) {
            const performanceKey = fragments.map((value) => value.toLocaleLowerCase()).join("\u0000");
            if (performanceKeys.has(performanceKey)) errors.push(`characters.${cid}.poses.${pose}.performance_signature duplica otra pose del personaje.`);
            performanceKeys.add(performanceKey);
          }
          if (def.mode === "generate") {
            if (!characterSignature || !containsExactText(def.prompt, characterSignature)) {
              errors.push(`characters.${cid}.poses.${pose}.prompt debe incluir exactamente characters.${cid}.prompt_signature.`);
            }
            for (const fragment of fragments) if (!containsExactText(def.prompt, fragment)) {
              errors.push(`characters.${cid}.poses.${pose}.prompt debe incluir performance_signature "${fragment}".`);
            }
            for (const invariant of negativeInvariants) if (!containsExactText(def.prompt, invariant)) {
              errors.push(`characters.${cid}.poses.${pose}.prompt debe incluir negative_invariant "${invariant}".`);
            }
            for (const required of ["no readable text", "no speech bubbles", "no watermark", "no logo"]) {
              if (!containsExactText(def.prompt, required)) {
                errors.push(`characters.${cid}.poses.${pose}.prompt debe incluir exactamente "${required}".`);
              }
            }
          }
        }
      }
      for (const [pose, rawPose] of Object.entries(poses || {})) {
        const def = manhwaAssetDef(rawPose);
        if (def.mode === "generate" && def.referenceKey && !poses[def.referenceKey]) {
          errors.push(`characters.${cid}.poses.${pose}: reference_pose "${def.referenceKey}" no existe.`);
        }
      }
    }
    for (const [eid, e] of Object.entries(escenarios)) {
      const scenarioPromptSignature = cleanString(e?.prompt_signature);
      const spatialRole = cleanString(e?.spatial_role);
      if (isManhwaV7) {
        if (!MANHWA_V7_SPATIAL_ROLE_MIN_VIEWS.has(spatialRole)) {
          errors.push(`escenarios.${eid}.spatial_role debe ser PRIMARY, SECONDARY o INCIDENTAL.`);
        } else escenarioRoles.set(eid, spatialRole);
        if (!scenarioPromptSignature) errors.push(`escenarios.${eid}.prompt_signature es obligatorio.`);
        validateV7DescriptorProfile(errors, `escenarios.${eid}`, e?.descriptor_profile,
          MANHWA_V7_SCENARIO_DESCRIPTOR_FIELDS, scenarioPromptSignature);
        if (MANHWA_V7_CAMERA_LANGUAGE_RE.test(scenarioPromptSignature)) {
          errors.push(`escenarios.${eid}.prompt_signature debe describir identidad arquitectonica, no terminos de camara.`);
        }
        if (MANHWA_V7_RELATIVE_SCENARIO_RE.test(scenarioPromptSignature)) {
          errors.push(`escenarios.${eid}.prompt_signature debe ser espacialmente absoluto; no uses same/as before/igual que antes/como antes.`);
        }
      }
      const views = manhwaEscenarioViews(e);
      if (!Object.keys(views).length) errors.push(`escenarios.${eid}: requiere reference_asset o views{}.`);
      const viewSignatures = new Set();
      for (const [view, rawView] of Object.entries(views)) {
        const def = validateManhwaAssetDef(errors, `escenarios.${eid}.views.${view}`, rawView, "escenarios", options.fileExists, serie);
        escenarioViewDefs.set(`${eid}:${view}`, def);
        if (isManhwaV7) {
          if (def.referenceAssets.length) {
            errors.push(`escenarios.${eid}.views.${view}.reference_assets esta prohibido en V7; usa reference_view para poder verificar compatibilidad de camara.`);
          }
          const viewSignature = cleanString(rawView?.prompt_signature);
          if (!viewSignature) errors.push(`escenarios.${eid}.views.${view}.prompt_signature es obligatorio.`);
          else {
            const signatureKey = viewSignature.toLocaleLowerCase();
            if (viewSignatures.has(signatureKey)) errors.push(`escenarios.${eid}.views.${view}.prompt_signature debe ser distinto de las demas vistas.`);
            viewSignatures.add(signatureKey);
            if (MANHWA_V7_CAMERA_LANGUAGE_RE.test(viewSignature)) {
              errors.push(`escenarios.${eid}.views.${view}.prompt_signature no puede contener lenguaje de camara.`);
            }
            if (MANHWA_V7_RELATIVE_SCENARIO_RE.test(viewSignature)) {
              errors.push(`escenarios.${eid}.views.${view}.prompt_signature debe ser espacialmente absoluto; no uses same/as before/igual que antes/como antes.`);
            }
          }
          const camera = validateV7CameraSignature(errors, `escenarios.${eid}.views.${view}`, rawView?.camera_signature);
          if (camera) escenarioCameraDefs.set(`${eid}:${view}`, camera);
          if (def.mode === "generate") {
            const sections = v7PromptSections(errors, `escenarios.${eid}.views.${view}`, def.prompt);
            if (sections) {
              validateV7CameraBlockAgainstLedger(errors, `escenarios.${eid}.views.${view}`, sections, camera);
              if (!containsExactText(sections.SUBJECTS, "empty environment") || !containsExactText(sections.SUBJECTS, "no characters")) {
                errors.push(`escenarios.${eid}.views.${view}.SUBJECTS debe incluir "empty environment" y "no characters".`);
              }
              if (!containsExactText(sections.ACTION, "static identity plate")) {
                errors.push(`escenarios.${eid}.views.${view}.ACTION debe incluir "static identity plate".`);
              }
              if (scenarioPromptSignature && !containsExactText(sections.ENVIRONMENT, scenarioPromptSignature)) {
                errors.push(`escenarios.${eid}.views.${view}.ENVIRONMENT debe incluir exactamente escenarios.${eid}.prompt_signature.`);
              }
              if (viewSignature && !containsExactText(sections.ENVIRONMENT, viewSignature)) {
                errors.push(`escenarios.${eid}.views.${view}.ENVIRONMENT debe incluir exactamente su prompt_signature de vista.`);
              }
            }
          }
        }
      }
      for (const [view, rawView] of Object.entries(views)) {
        const def = manhwaAssetDef(rawView);
        if (def.mode === "generate" && def.referenceKey && !views[def.referenceKey]) {
          errors.push(`escenarios.${eid}.views.${view}: reference_view "${def.referenceKey}" no existe.`);
        }
        if (isManhwaV7 && def.referenceKey && views[def.referenceKey]) {
          const camera = escenarioCameraDefs.get(`${eid}:${view}`);
          const referenceCamera = escenarioCameraDefs.get(`${eid}:${def.referenceKey}`);
          if (camera && referenceCamera) {
            const mismatches = [];
            if (!sameToken(camera.elevation, referenceCamera.elevation)) mismatches.push("elevation");
            if (!sameToken(camera.viewpoint, referenceCamera.viewpoint)) mismatches.push("viewpoint");
            if (angularDistance(camera.azimuth_deg, referenceCamera.azimuth_deg) > 20) mismatches.push("azimuth_deg >20");
            if (Math.abs(camera.lens_mm - referenceCamera.lens_mm) > 15) mismatches.push("lens_mm >15");
            if (Math.abs(camera.roll_deg - referenceCamera.roll_deg) > 10) mismatches.push("roll_deg >10");
            if (mismatches.length) errors.push(`escenarios.${eid}.views.${view}.reference_view incompatible (${mismatches.join(", ")}); omite reference_view para un angulo nuevo.`);
          }
        }
      }
    }

    if (isManhwa) {
      const cycle = rawJson?.editing?.panel_motion?.cycle;
      for (const [i, name] of (Array.isArray(cycle) ? cycle : []).entries()) {
        if (!MANHWA_MOTION_PRESETS.has(cleanString(name))) errors.push(`editing.panel_motion.cycle[${i}]: preset de motion invalido "${name}" (validos: ${[...MANHWA_MOTION_PRESETS].join(", ")}).`);
      }
    }

    const referencedCharIds = new Set();
    const pageSources = new Set();
    const v7ShotSources = [];
    const v7NativeCameras = [];
    const v7NativeLayouts = [];
    const v7NativeFamilies = [];
    const v7NativeScenarioUsage = [];
    let v7PriorContinuity = null;
    const validatePageRuntimeReferences = (s, page, v7 = false) => {
      const id = sceneId(s);
      const slots = Array.isArray(page?.slots) ? page.slots : [];
      const shotsBySlotId = new Map();
      const usageBySlotId = new Map();
      for (const [slotIndex, slot] of slots.entries()) {
        const label = `${id}.page_blueprint.slots[${slotIndex}]`;
        const prompt = cleanString(slot?.prompt);
        const promptSections = v7 ? v7PromptSections([], label, prompt) : null;
        const slotUsage = { poses: [], geometryViews: [] };
        usageBySlotId.set(cleanString(slot?.id), slotUsage);
        const refs = slot?.references && typeof slot.references === "object" && !Array.isArray(slot.references)
          ? slot.references : null;
        if (!refs) {
          errors.push(`${label}: references runtime obligatorio; references_v${v7 ? "7" : "6"} no lo sustituye.`);
          continue;
        }
        let slotRefCount = 0;
        for (const ref of Array.isArray(refs.characters) ? refs.characters : []) {
          const cid = typeof ref === "string" ? cleanString(ref) : cleanString(ref?.id) || cleanString(ref?.character_id);
          const pose = typeof ref === "string" ? "" : cleanString(ref?.pose);
          if (!cid || !manhwaChars[cid]) errors.push(`${label}: references.characters apunta a personaje inexistente "${cid || "(vacio)"}".`);
          else if (!pose || !poseDefs.has(`${cid}:${pose}`)) errors.push(`${label}: pose inexistente "${cid}.${pose || "(vacia)"}".`);
          else {
            referencedCharIds.add(cid);
            if (v7) {
              const signature = cleanString(manhwaChars[cid]?.prompt_signature);
              if (!signature) errors.push(`${label}: characters.${cid}.prompt_signature es obligatorio al referenciar el personaje.`);
              else if (!promptSections || !containsExactText(promptSections.SUBJECTS, signature)) {
                errors.push(`${label}: SUBJECTS debe incluir exactamente characters.${cid}.prompt_signature (sin depender del nombre "${cid}").`);
              }
              const rawPose = manhwaChars[cid]?.poses?.[pose];
              const performance = rawPose?.performance_signature;
              for (const field of MANHWA_V7_PERFORMANCE_FIELDS) {
                const performanceValue = cleanString(performance?.[field]);
                if (performanceValue && (!promptSections || !containsExactText(promptSections.ACTION, performanceValue))) {
                  errors.push(`${label}: ACTION debe incluir exactamente ${cid}.${pose}.performance_signature.${field}: "${performanceValue}".`);
                }
              }
              for (const invariant of stringArray(manhwaChars[cid]?.negative_invariants)) {
                if (!promptSections || !containsExactText(promptSections.NEGATIVE, invariant)) {
                  errors.push(`${label}: NEGATIVE debe incluir exactamente characters.${cid}.negative_invariant "${invariant}".`);
                }
              }
              const usage = characterPoseUsage.get(cid) || { count: 0, poses: new Set() };
              usage.count++;
              usage.poses.add(pose);
              characterPoseUsage.set(cid, usage);
              slotUsage.poses.push({ cid, pose });
            }
          }
          slotRefCount++;
        }
        for (const ref of Array.isArray(refs.assets) ? refs.assets : []) {
          const aid = typeof ref === "string" ? cleanString(ref) : cleanString(ref?.id) || cleanString(ref?.asset_id);
          const pose = (typeof ref === "string" ? "" : cleanString(ref?.pose)) || "base";
          if (!aid || !poseDefs.has(`${aid}:${pose}`)) errors.push(`${label}: references.assets apunta a asset/pose inexistente "${aid || "(vacio)"}.${pose}".`);
          else referencedCharIds.add(aid);
          slotRefCount++;
        }
        const slotEsc = manhwaEscenarioRef(refs.escenario);
        if (slotEsc.id) {
          const viewKey = `${slotEsc.id}:${slotEsc.view}`;
          if (!escenarioViewDefs.has(viewKey)) errors.push(`${label}: escenario/view inexistente "${slotEsc.id}.${slotEsc.view}".`);
          if (v7 && escenarios[slotEsc.id]) {
            const signature = cleanString(escenarios[slotEsc.id]?.prompt_signature);
            if (!signature) errors.push(`${label}: escenarios.${slotEsc.id}.prompt_signature es obligatorio al referenciar el escenario.`);
            else if (promptSections && !cleanString(promptSections.ENVIRONMENT).toLocaleLowerCase().includes(signature.toLocaleLowerCase())) {
              errors.push(`${label}: ENVIRONMENT debe incluir exactamente escenarios.${slotEsc.id}.prompt_signature.`);
            }
            const viewSignature = cleanString(escenarios[slotEsc.id]?.views?.[slotEsc.view]?.prompt_signature);
            if (!viewSignature) errors.push(`${label}: escenarios.${slotEsc.id}.views.${slotEsc.view}.prompt_signature es obligatorio.`);
            else if (!promptSections || !containsExactText(promptSections.ENVIRONMENT, viewSignature)) {
              errors.push(`${label}: ENVIRONMENT debe incluir exactamente escenarios.${slotEsc.id}.views.${slotEsc.view}.prompt_signature.`);
            }
          }
          slotRefCount++;
        }
        for (const rid of ingredientRefIds(refs.ingredients)) {
          if (!runtimeIngredientIds.has(rid)) errors.push(`${label}: ingrediente inexistente "${rid}".`);
          slotRefCount++;
        }
        for (const [refIndex, ref] of (Array.isArray(refs.scenes) ? refs.scenes : []).entries()) {
          const sid = cleanString(ref?.scene_id);
          if (!sid || !sceneSet.has(sid)) errors.push(`${label}: references.scenes[${refIndex}] apunta a escena inexistente "${sid || "(vacio)"}".`);
          else slotRefCount++;
        }
        if (slotRefCount === 0) errors.push(`${label}: requiere al menos una referencia runtime para identidad/continuidad.`);

        if (v7) {
          const continuity = slot?.continuity_lock ?? slot?.continuity;
          if (!continuity || typeof continuity !== "object" || Array.isArray(continuity)) {
            errors.push(`${label}: continuity_lock obligatorio.`);
          }
          const ledger = validateV7ShotLedger(errors, label, slot?.shot_ledger);
          validateV7CameraBlockAgainstLedger(errors, label, promptSections, ledger);
          if (ledger) shotsBySlotId.set(cleanString(slot?.id), { label, ledger });
          if (slotEsc.id && escenarios[slotEsc.id]) {
            const authority = cleanString(refs?.escenario?.geometry_authority) || "GEOMETRY_LOCK";
            if (!["GEOMETRY_LOCK", "IDENTITY_ONLY"].includes(authority)) {
              errors.push(`${label}: references.escenario.geometry_authority debe ser GEOMETRY_LOCK o IDENTITY_ONLY.`);
            }
            v7ScenarioRefCount++;
            if (authority === "IDENTITY_ONLY") {
              v7IdentityOnlyRefCount++;
              if (!cleanString(refs?.escenario?.identity_only_reason)) {
                errors.push(`${label}: IDENTITY_ONLY requiere references.escenario.identity_only_reason no vacio.`);
              }
            } else if (authority === "GEOMETRY_LOCK") {
              const viewsUsed = referencedGeometryViews.get(slotEsc.id) || new Set();
              viewsUsed.add(slotEsc.view);
              referencedGeometryViews.set(slotEsc.id, viewsUsed);
              slotUsage.geometryViews.push({ eid: slotEsc.id, view: slotEsc.view });
            }
            const camera = escenarioCameraDefs.get(`${slotEsc.id}:${slotEsc.view}`);
            if (authority !== "IDENTITY_ONLY" && ledger && camera) {
              const mismatches = [];
              if (!sameToken(ledger.elevation, camera.elevation)) mismatches.push(`elevation ${ledger.elevation} != ${camera.elevation}`);
              if (!sameToken(ledger.viewpoint, camera.viewpoint)) mismatches.push(`viewpoint ${ledger.viewpoint} != ${camera.viewpoint}`);
              if (angularDistance(ledger.azimuth_deg, camera.azimuth_deg) > 20) mismatches.push(`azimuth_deg difiere >20`);
              if (Math.abs(ledger.lens_mm - camera.lens_mm) > 15) mismatches.push(`lens_mm difiere >15`);
              if (mismatches.length) errors.push(`${label}: referencia de escenario incompatible con shot_ledger bajo GEOMETRY_LOCK (${mismatches.join(", ")}).`);
            }
          }
        }
      }
      if (v7) {
        const readingOrder = Array.isArray(page?.reading_order) ? page.reading_order : [];
        const ordered = readingOrder.map((slotId) => shotsBySlotId.get(slotId)).filter(Boolean);
        for (const shot of ordered.length === shotsBySlotId.size ? ordered : shotsBySlotId.values()) v7ShotSources.push(shot);
        const orderedUsage = readingOrder.map((slotId) => usageBySlotId.get(slotId)).filter(Boolean);
        const usageSequence = orderedUsage.length === usageBySlotId.size ? orderedUsage : [...usageBySlotId.values()];
        for (const usage of usageSequence) {
          for (const { cid, pose } of usage.poses) {
            const sequence = characterPoseSequence.get(cid) || [];
            sequence.push(pose);
            characterPoseSequence.set(cid, sequence);
          }
          for (const { eid, view } of usage.geometryViews) {
            const sequence = referencedGeometryViewSequence.get(eid) || [];
            sequence.push(view);
            referencedGeometryViewSequence.set(eid, sequence);
          }
        }
      }
    };
    const validateNativeSceneRuntime = (s) => {
      const id = sceneId(s);
      const visual = s?.visual;
      validateExactObjectKeys(errors, `${id}.visual`, visual, ["image_prompt"]);
      const imagePrompt = cleanString(visual?.image_prompt);
      if (!imagePrompt) errors.push(`${id}.visual.image_prompt natural es obligatorio.`);
      if (imagePrompt === "COMPOSITION_ONLY_V7_FROM_DECLARED_SLOTS") {
        errors.push(`${id}.visual.image_prompt: sentinel compositor prohibido; Grok recibe el prompt completo.`);
      }

      const visualPlan = s?.visual_plan;
      validateExactObjectKeys(errors, `${id}.visual_plan`, visualPlan, ["native_page", "shots"]);
      const nativePage = visualPlan?.native_page;
      validateExactObjectKeys(errors, `${id}.visual_plan.native_page`, nativePage,
        ["family", "layout", "background_pct", "panel_count", "composition"]);
      const family = cleanString(nativePage?.family);
      const layout = cleanString(nativePage?.layout);
      const layoutDef = MANHWA_V7_NATIVE_PAGE_LAYOUTS.get(layout);
      if (!MANHWA_V7_PAGE_FAMILIES.has(family)) errors.push(`${id}.visual_plan.native_page.family invalida "${family || "(vacia)"}".`);
      if (!layoutDef) errors.push(`${id}.visual_plan.native_page.layout Grok-native invalido "${layout || "(vacio)"}".`);
      else if (layoutDef.family !== family) errors.push(`${id}.visual_plan.native_page.layout ${layout} pertenece a ${layoutDef.family}, no a ${family}.`);
      const panelCount = nativePage?.panel_count;
      if (!Number.isInteger(panelCount) || panelCount < 1 || panelCount > 3) errors.push(`${id}.visual_plan.native_page.panel_count debe ser entero 1..3.`);
      else if (layoutDef && panelCount !== layoutDef.panels) errors.push(`${id}.visual_plan.native_page.panel_count: ${layout} exige ${layoutDef.panels}.`);
      const backgroundPct = nativePage?.background_pct;
      if (!finiteNumber(backgroundPct)) errors.push(`${id}.visual_plan.native_page.background_pct debe ser numerico.`);
      else if (family === "WHITE_PAGE" && (backgroundPct < 30 || backgroundPct > 90)) errors.push(`${id}.visual_plan.native_page.background_pct: WHITE_PAGE usa 30..90.`);
      else if (family === "BLACK_PAGE" && (backgroundPct < 45 || backgroundPct > 75)) errors.push(`${id}.visual_plan.native_page.background_pct: BLACK_PAGE usa 45..75.`);
      else if (family === "OTHER" && backgroundPct !== 0) errors.push(`${id}.visual_plan.native_page.background_pct: OTHER usa exactamente 0.`);
      if (!cleanString(nativePage?.composition)) errors.push(`${id}.visual_plan.native_page.composition es obligatorio.`);

      const staticMotion = { enabled: false, preset: "static", zoom: 1, pan: 0 };
      const motion = s?.editor_motion;
      if (["WHITE_PAGE", "BLACK_PAGE"].includes(family)) {
        if (JSON.stringify(motion) !== JSON.stringify(staticMotion)) {
          errors.push(`${id}.editor_motion: WHITE/BLACK ya vienen compuestas por Grok y exigen {enabled:false,preset:"static",zoom:1,pan:0}.`);
        }
      } else if (family === "OTHER" && JSON.stringify(motion) !== JSON.stringify(staticMotion)) {
        const safeMotion = motion && typeof motion === "object" && !Array.isArray(motion)
          && motion.enabled === true && ["slow_zoom", "slow_pan"].includes(cleanString(motion.preset))
          && finiteNumber(motion.zoom) && motion.zoom >= 1 && motion.zoom <= 1.08
          && finiteNumber(motion.pan) && motion.pan >= 0 && motion.pan <= 0.03;
        if (!safeMotion) errors.push(`${id}.editor_motion: motion OTHER inseguro; usa static o slow_zoom/slow_pan con zoom<=1.08 y pan<=0.03.`);
      }

      const shots = Array.isArray(visualPlan?.shots) ? visualPlan.shots : [];
      if (!Array.isArray(visualPlan?.shots)) errors.push(`${id}.visual_plan.shots debe ser un array.`);
      if (Number.isInteger(panelCount) && shots.length !== panelCount) errors.push(`${id}.visual_plan.shots.length debe coincidir con panel_count=${panelCount}.`);
      const knownEntities = new Set([...Object.keys(manhwaChars), ...runtimeIngredientIds]);
      const poseMap = sceneCharacterPoseMap(s?.references);
      const scenarioRefRaw = s?.references?.escenario;
      const scenarioAuthority = scenarioRefRaw && typeof scenarioRefRaw === "object" && !Array.isArray(scenarioRefRaw)
        ? cleanString(scenarioRefRaw.geometry_authority) || "GEOMETRY_LOCK" : "GEOMETRY_LOCK";
      if (!scenarioRefRaw || typeof scenarioRefRaw !== "object" || Array.isArray(scenarioRefRaw)
          || !cleanString(scenarioRefRaw.id) || !cleanString(scenarioRefRaw.view)) {
        errors.push(`${id}.references.escenario debe ser objeto con id y view explicitos; V7 no permite base implicita.`);
      }
      if (!["GEOMETRY_LOCK", "IDENTITY_ONLY"].includes(scenarioAuthority)) errors.push(`${id}.references.escenario.geometry_authority debe ser GEOMETRY_LOCK o IDENTITY_ONLY.`);
      if (scenarioAuthority === "IDENTITY_ONLY" && !cleanString(scenarioRefRaw?.identity_only_reason)) {
        errors.push(`${id}.references.escenario.identity_only_reason es obligatorio para IDENTITY_ONLY.`);
      }

      const validatedShots = [];
      for (const [shotIndex, rawShot] of shots.entries()) {
        const shotLabel = `${id}.visual_plan.shots[${shotIndex}]`;
        const expectedPanelId = String.fromCharCode(65 + shotIndex);
        validateExactObjectKeys(errors, shotLabel, rawShot,
          ["panel_id", "content_role", "visible_entities", "location_id", "view_id", "camera", "prompt_fragment"]);
        const shot = rawShot && typeof rawShot === "object" && !Array.isArray(rawShot) ? rawShot : {};
        if (cleanString(shot.panel_id) !== expectedPanelId) errors.push(`${shotLabel}.panel_id debe ser "${expectedPanelId}" por reading order.`);
        if (!cleanString(shot.content_role)) errors.push(`${shotLabel}.content_role es obligatorio.`);
        if (!cleanString(shot.prompt_fragment)) errors.push(`${shotLabel}.prompt_fragment natural es obligatorio.`);
        const visible = shot.visible_entities;
        if (!Array.isArray(visible) || visible.length !== new Set(visible).size
            || visible.some((entity) => typeof entity !== "string" || !knownEntities.has(entity))) {
          errors.push(`${shotLabel}.visible_entities debe ser una lista unica de IDs conocidos de characters/ingredients.`);
        }
        const locationId = cleanString(shot.location_id);
        const viewId = cleanString(shot.view_id);
        if (!locationId || !escenarios[locationId]) errors.push(`${shotLabel}.location_id apunta a escenario inexistente "${locationId || "(vacio)"}".`);
        if (!viewId || !escenarioViewDefs.has(`${locationId}:${viewId}`)) errors.push(`${shotLabel}.view_id inexistente "${locationId}.${viewId || "(vacio)"}"; no hay fallback implicito.`);
        const camera = validateV7NativeCamera(errors, `${shotLabel}.camera`, shot.camera);
        if (camera) {
          const viewCamera = escenarioCameraDefs.get(`${locationId}:${viewId}`);
          if (viewCamera) {
            const mismatches = [];
            if (!sameToken(camera.elevation, viewCamera.elevation)) mismatches.push("elevation");
            if (!sameToken(camera.viewpoint, viewCamera.viewpoint)) mismatches.push("viewpoint");
            if (angularDistance(camera.azimuth_deg, viewCamera.azimuth_deg) > 20) mismatches.push("azimuth_deg >20");
            if (Math.abs(camera.lens_mm - viewCamera.lens_mm) > 15) mismatches.push("lens_mm >15");
            if (Math.abs(camera.roll_deg - viewCamera.roll_deg) > 10) mismatches.push("roll_deg >10");
            if (mismatches.length) {
              const message = `${shotLabel}.camera contradice escenarios.${locationId}.views.${viewId}.camera_signature (${mismatches.join(", ")}).`;
              // Solo la vista ambiental del primer shot con GEOMETRY_LOCK se adjunta realmente a Grok.
              // Las cámaras B/C viven en el prompt natural y en metadata editorial; una discrepancia allí
              // debe quedar visible para el Auditor, pero no puede impedir que la extensión reclame el JSON.
              if (shotIndex === 0 && scenarioAuthority === "GEOMETRY_LOCK") errors.push(message);
              else warnings.push(`QA editorial no bloqueante: ${message}`);
            }
          }
          v7NativeCameras.push({ label: shotLabel, camera, visible: Array.isArray(visible) ? visible : [] });
        }
        for (const entity of Array.isArray(visible) ? visible : []) {
          const pose = poseMap.get(entity);
          if (pose && manhwaChars[entity]) {
            referencedCharIds.add(entity);
          }
        }
        if (locationId && viewId) v7NativeScenarioUsage.push({ eid: locationId, view: viewId, authority: scenarioAuthority, label: shotLabel });
        validatedShots.push({ ...shot, camera });
      }
      if (validatedShots.length > 1) {
        const materiallyDistinct = validatedShots.some((left, leftIndex) => validatedShots.slice(leftIndex + 1)
          .some((right) => nativeCameraChangeCount(left.camera, right.camera) >= 2));
        if (!materiallyDistinct) errors.push(`${id}.visual_plan.shots: pagina multipanel exige al menos dos camaras materialmente distintas.`);
      }
      const firstShot = validatedShots[0];
      if (firstShot && scenarioAuthority === "GEOMETRY_LOCK") {
        const referenceLocationId = cleanString(scenarioRefRaw?.id);
        const referenceViewId = cleanString(scenarioRefRaw?.view);
        const firstLocationId = cleanString(firstShot.location_id);
        const firstViewId = cleanString(firstShot.view_id);
        if (referenceLocationId !== firstLocationId || referenceViewId !== firstViewId) {
          errors.push(`${id}.references.escenario GEOMETRY_LOCK debe coincidir exactamente con el primer shot: esperado ${firstLocationId}.${firstViewId}, recibido ${referenceLocationId || "(vacio)"}.${referenceViewId || "(vacio)"}. Esa es la vista que el runtime adjunta a Grok.`);
        }
      }
      validateV7NativePrompt(errors, `${id}.visual.image_prompt`, imagePrompt, nativePage, validatedShots, s?.references,
        { manhwaChars, escenarios });

      const continuity = s?.continuity;
      if (!continuity || typeof continuity !== "object" || Array.isArray(continuity)) errors.push(`${id}.continuity es obligatorio.`);
      else {
        if (!continuity.state_in || typeof continuity.state_in !== "object" || Array.isArray(continuity.state_in)) errors.push(`${id}.continuity.state_in debe ser objeto.`);
        if (!continuity.state_out || typeof continuity.state_out !== "object" || Array.isArray(continuity.state_out)) errors.push(`${id}.continuity.state_out debe ser objeto.`);
        if (v7PriorContinuity && JSON.stringify(continuity.state_in) !== JSON.stringify(v7PriorContinuity.state_out)) {
          errors.push(`${id}.continuity.state_in debe copiar exactamente state_out de la escena panel anterior.`);
        }
        for (const key of ["location_id", "lighting_id"]) if (v7PriorContinuity && continuity[key] !== v7PriorContinuity[key]
            && !cleanString(continuity.continuity_change_reason)) {
          errors.push(`${id}.continuity.${key}: cambio exige continuity_change_reason.`);
        }
        v7PriorContinuity = continuity;
      }
      if (s?.references_v7 != null && !Array.isArray(s.references_v7)) errors.push(`${id}.references_v7 debe ser lista audit-only si se declara.`);
      if (family) v7NativeFamilies.push(family);
      if (layout) v7NativeLayouts.push(layout);
    };
    for (const s of scenes) {
      const id = sceneId(s);
      const type = cleanString(s?.type) || "panel";
      if (isManhwaV7 && !cleanString(s?.type)) errors.push(`${id}: V7 exige type explicito "panel" o "narrative_card".`);
      if (isManhwa && !["panel", "narrative_card"].includes(type)) errors.push(`${id}: type invalido "${type}".`);
      if (isNovelaV2 && type !== "panel") errors.push(`${id}: novela-coreana v2 anima todas las escenas; no uses type "${type}".`);
      const v7Page = s?.visual?.page_blueprint;
      if (isManhwaV7 && type === "panel") validateNativeSceneRuntime(s);
      if (type === "narrative_card") {
        if (isManhwaV7) for (const prohibited of ["visual", "visual_plan", "continuity", "render_mode", "page_blueprint"]) {
          if (Object.hasOwn(s || {}, prohibited)) errors.push(`${id}: narrative_card no puede llevar ${prohibited}.`);
        }
        const mode = cleanString(s?.card?.mode) || "editor";
        if (!normalizeText(s?.card?.text)) errors.push(`${id}: narrative_card requiere card.text.`);
        if (!["editor", "generated"].includes(mode)) errors.push(`${id}: card.mode invalido "${mode}".`);
        // las refs de una card no se validan (la card no genera imagen) pero SI cuentan como "referenciado"
        // para no dar el warning espurio de asset-sin-usar (caso sistema_ui referenciado solo en una card).
        for (const ref of [...(Array.isArray(s?.references?.characters) ? s.references.characters : []),
                           ...(Array.isArray(s?.references?.assets) ? s.references.assets : [])]) {
          const rid = typeof ref === "string" ? cleanString(ref) : cleanString(ref?.id);
          if (rid) referencedCharIds.add(rid);
        }
        continue;
      }

      const renderMode = cleanString(s?.render_mode) || (isManhwa ? "static" : "animated");
      if (!["static", "animated"].includes(renderMode)) errors.push(`${id}: render_mode invalido "${renderMode}".`);
      const imagePrompt = cleanString(s?.image_prompt) || cleanString(s?.image?.prompt) || cleanString(s?.visual?.image_prompt);
      const animPrompt = cleanString(s?.animation_prompt) || cleanString(s?.animation?.prompt) || cleanString(s?.visual?.animation_prompt);
      if (!imagePrompt) errors.push(`${id}: panel requiere visual.image_prompt.`);
      if (isManhwa && /\bpage\s+summary\b/i.test(imagePrompt)) {
        errors.push(`${id}: visual.image_prompt no puede ser "Page summary"; debe ser un prompt de imagen generable (usa el primer slot como fallback).`);
      }
      if ((renderMode === "animated" || isNovelaV2) && !animPrompt) errors.push(`${id}: panel animated requiere visual.animation_prompt.`);
      if (isManhwa && renderMode === "static" && animPrompt) warnings.push(`${id}: panel static trae animation_prompt; se ignora.`);
      if (isNovelaV2 && cleanString(s?.render_mode) && renderMode !== "animated") errors.push(`${id}: novela-coreana v2 debe animarse; usa render_mode "animated" o omite el campo.`);
      const motionPreset = cleanString(s?.editor_motion?.preset) || cleanString(s?.edition_motion?.preset);
      if (isManhwa && motionPreset && !MANHWA_MOTION_PRESETS.has(motionPreset)) errors.push(`${id}: editor_motion.preset invalido "${motionPreset}" (validos: ${[...MANHWA_MOTION_PRESETS].join(", ")}).`);
      const transitionIn = cleanString(s?.transition_in);
      if (isManhwa && transitionIn && !MANHWA_TRANSITIONS.has(transitionIn)) errors.push(`${id}: transition_in invalido "${transitionIn}" (validos: ${[...MANHWA_TRANSITIONS].join(", ")}).`);

      let v2ReferenceCount = 0;
      for (const ref of Array.isArray(s?.references?.characters) ? s.references.characters : []) {
        const cid = typeof ref === "string" ? ref : cleanString(ref?.id) || cleanString(ref?.character_id);
        const pose = typeof ref === "string" ? "" : cleanString(ref?.pose);
        if (!cid) { errors.push(`${id}: references.characters contiene una referencia sin id.`); continue; }
        if (!manhwaChars[cid]) { errors.push(`${id}: references.characters apunta a personaje inexistente "${cid}".`); continue; }
        referencedCharIds.add(cid);
        if (!pose) { errors.push(`${id}: references.characters.${cid} requiere pose.`); continue; }
        if (!manhwaChars[cid]?.poses?.[pose]) errors.push(`${id}: personaje "${cid}" no tiene pose "${pose}".`);
        if (pose && !poseDefs.has(`${cid}:${pose}`)) errors.push(`${id}: pose "${cid}.${pose}" no esta normalizada.`);
        v2ReferenceCount++;
      }
      // references.assets es un mecanismo del preset manhwa (sistema_ui). En novela v2 se ignora (como
      // antes del fix 2026-07-06) para no rechazar JSONs que el render tolera.
      if (isManhwa) for (const [k, ref] of (Array.isArray(s?.references?.assets) ? s.references.assets : []).entries()) {
        const aid = typeof ref === "string" ? cleanString(ref) : cleanString(ref?.id) || cleanString(ref?.asset_id);
        const pose = (typeof ref === "string" ? "" : cleanString(ref?.pose)) || "base";
        if (!aid) { errors.push(`${id}: references.assets[${k}] sin id.`); continue; }
        if (!manhwaChars[aid]) { errors.push(`${id}: references.assets apunta a asset inexistente "${aid}" (debe declararse en characters).`); continue; }
        referencedCharIds.add(aid);
        if (!manhwaChars[aid]?.poses?.[pose]) errors.push(`${id}: asset "${aid}" no tiene pose "${pose}".`);
        v2ReferenceCount++;
      }
      const escRef = manhwaEscenarioRef(s?.references?.escenario);
      if (escRef.id && !escenarios[escRef.id]) errors.push(`${id}: references.escenario apunta a escenario inexistente "${escRef.id}".`);
      else if (escRef.id && !escenarioViewDefs.has(`${escRef.id}:${escRef.view}`)) errors.push(`${id}: escenario "${escRef.id}" no tiene view "${escRef.view}".`);
      else if (escRef.id) v2ReferenceCount++;
      v2ReferenceCount += ingredientRefIds(s?.references?.ingredients).length;
      if (isNovelaV2 && v2ReferenceCount === 0) errors.push(`${id}: novela-coreana v2 requiere al menos una referencia valida (personaje pose, escenario view o ingrediente).`);
      const page = s?.visual?.page_blueprint;
      if (isManhwa && !isManhwaV7 && page && typeof page === "object" && cleanString(page.template) !== "FULL_BLEED") {
        if (rawJson?.v6_contract?.runtime_adapter?.page_blueprint_slots_integrated !== true) {
          errors.push(`${id}: page_blueprint requiere v6_contract.runtime_adapter.page_blueprint_slots_integrated=true.`);
        }
        validateManhwaPageBlueprint(errors, s, page, pageSources);
        validatePageRuntimeReferences(s, page, false);
      }
    }
    if (isManhwaV7) {
      const identityOnlyCount = v7NativeScenarioUsage.filter((item) => item.authority === "IDENTITY_ONLY").length;
      if (v7NativeScenarioUsage.length && identityOnlyCount / v7NativeScenarioUsage.length > 0.10 + 1e-9) {
        errors.push(`V7 IDENTITY_ONLY: ${identityOnlyCount}/${v7NativeScenarioUsage.length} referencias de escenario exceden 10%.`);
      }
      for (const [eid, role] of escenarioRoles) {
        const geometryUsage = v7NativeScenarioUsage.filter((item) => item.eid === eid && item.authority === "GEOMETRY_LOCK");
        const usedViews = new Set(geometryUsage.map((item) => item.view));
        const declaredViewCount = Object.keys(escenarios[eid]?.views || {}).length;
        const requiredViews = Math.min(MANHWA_V7_SPATIAL_ROLE_MIN_VIEWS.get(role), declaredViewCount);
        if (usedViews.size < requiredViews) {
          errors.push(`escenarios.${eid} (${role}): ${usedViews.size} views GEOMETRY_LOCK referenciadas; requiere al menos ${requiredViews}.`);
        }
        const sequence = geometryUsage.map((item) => item.view);
        let previousView = "", run = 0;
        const counts = new Map();
        for (const view of sequence) {
          counts.set(view, (counts.get(view) || 0) + 1);
          run = view === previousView ? run + 1 : 1;
          previousView = view;
          if (role === "PRIMARY" && run > 2) {
            errors.push(`escenarios.${eid}: view "${view}" aparece mas de 2 referencias GEOMETRY_LOCK consecutivas.`);
            break;
          }
        }
        if (role === "PRIMARY" && sequence.length >= 6) {
          for (const [view, count] of counts) if (count / sequence.length > 0.35 + 1e-9) {
            errors.push(`escenarios.${eid}: view "${view}" ocupa ${count}/${sequence.length} referencias GEOMETRY_LOCK (>35%).`);
          }
        }
      }

      const cameras = v7NativeCameras.map((item) => item.camera);
      if (cameras.length) {
        const materialTransitions = cameras.slice(1).filter((camera, index) => nativeCameraChangeCount(cameras[index], camera) >= 2).length;
        const minContrastPct = finiteNumber(rawJson?.v7_contract?.thresholds?.min_camera_contrast_pct)
          ? rawJson.v7_contract.thresholds.min_camera_contrast_pct : 60;
        if (cameras.length > 1 && materialTransitions * 100 / (cameras.length - 1) < minContrastPct - 1e-9) {
          errors.push(`V7 camera contrast: ${materialTransitions}/${cameras.length - 1} transiciones materiales <${minContrastPct}%.`);
        }
        const maxCameraRun = Number.isInteger(rawJson?.v7_contract?.thresholds?.max_identical_camera_run)
          ? rawJson.v7_contract.thresholds.max_identical_camera_run : 2;
        let previousKey = "", signatureRun = 0;
        for (const [index, camera] of cameras.entries()) {
          const key = nativeCameraKey(camera);
          signatureRun = key === previousKey ? signatureRun + 1 : 1;
          previousKey = key;
          if (signatureRun > maxCameraRun) errors.push(`${v7NativeCameras[index].label}: firma de camara exacta repetida mas de ${maxCameraRun} veces.`);
        }
        const humanCameras = v7NativeCameras.filter((item) => item.visible.some((entity) => manhwaChars[entity])).map((item) => item.camera);
        if (!humanCameras.length) errors.push("V7 camera quota: no hay tomas con personaje conocido visible.");
        else {
          const nonEyePct = humanCameras.filter((camera) => camera.elevation !== "EYE_LEVEL").length * 100 / humanCameras.length;
          const nonFrontalPct = humanCameras.filter((camera) => !["FRONT", "THREE_QUARTER_FRONT"].includes(camera.viewpoint)).length * 100 / humanCameras.length;
          const minNonEye = finiteNumber(rawJson?.v7_contract?.thresholds?.min_non_eye_level_pct) ? rawJson.v7_contract.thresholds.min_non_eye_level_pct : 20;
          const minNonFrontal = finiteNumber(rawJson?.v7_contract?.thresholds?.min_non_frontal_pct) ? rawJson.v7_contract.thresholds.min_non_frontal_pct : 35;
          if (nonEyePct < minNonEye - 1e-9) errors.push(`V7 camera quota non-eye-level ${nonEyePct.toFixed(1)}% <${minNonEye}%.`);
          if (nonFrontalPct < minNonFrontal - 1e-9) errors.push(`V7 camera quota non-frontal ${nonFrontalPct.toFixed(1)}% <${minNonFrontal}%.`);
        }
        const requiredFamilies = {
          high: cameras.some((camera) => ["HIGH", "BIRDS_EYE", "TOP_DOWN"].includes(camera.elevation)),
          low: cameras.some((camera) => ["LOW", "WORMS_EYE", "GROUND_LEVEL"].includes(camera.elevation)),
          relation: cameras.some((camera) => ["OTS", "POV"].includes(camera.viewpoint)),
          profile_rear: cameras.some((camera) => ["PROFILE", "REAR", "REAR_THREE_QUARTER"].includes(camera.viewpoint)),
        };
        for (const [family, present] of Object.entries(requiredFamilies)) if (!present) errors.push(`V7 camera family obligatoria ausente: ${family}.`);
        const distinctCameraCount = new Set(cameras.map(nativeCameraKey)).size;
        const minDistinct = Number.isInteger(rawJson?.v7_contract?.thresholds?.min_distinct_camera_signatures)
          ? rawJson.v7_contract.thresholds.min_distinct_camera_signatures : 6;
        if (distinctCameraCount < minDistinct) errors.push(`V7 camera signatures: solo ${distinctCameraCount}; requiere ${minDistinct}.`);
      }

      const minDistinctLayouts = Number.isInteger(rawJson?.v7_contract?.thresholds?.min_distinct_page_layouts)
        ? rawJson.v7_contract.thresholds.min_distinct_page_layouts : 6;
      const requiredLayouts = Math.min(v7NativeLayouts.length, Math.max(6, minDistinctLayouts));
      if (new Set(v7NativeLayouts).size < requiredLayouts) errors.push(`V7 layout diversity: solo ${new Set(v7NativeLayouts).size}; requiere ${requiredLayouts}.`);
      if (v7NativeLayouts.length) {
        const multiCount = v7NativeLayouts.filter((layout) => [2, 3].includes(MANHWA_V7_NATIVE_PAGE_LAYOUTS.get(layout)?.panels)).length;
        const multiPct = multiCount * 100 / v7NativeLayouts.length;
        if (multiPct < 20 - 1e-9 || multiPct > 40 + 1e-9) errors.push(`V7 multipanel: ${multiCount}/${v7NativeLayouts.length}=${multiPct.toFixed(1)}% fuera de 20..40%.`);
        const triptychs = v7NativeLayouts.filter((layout) => MANHWA_V7_NATIVE_PAGE_LAYOUTS.get(layout)?.panels === 3).length;
        if (triptychs > Math.floor(v7NativeLayouts.length * 0.10)) errors.push(`V7 triptychs: ${triptychs} exceden floor(0.10x${v7NativeLayouts.length}).`);
      }
    }

    // Un personaje/asset declarado que ninguna escena referencia se genera pero nunca se adjunta (caso
    // sistema_ui). Solo manhwa: en novela v2 el opening compartido puede referenciar fuera de scenes[].
    if (isManhwa) for (const cid of Object.keys(manhwaChars)) {
      if (!referencedCharIds.has(cid)) warnings.push(`characters.${cid}: declarado pero ninguna escena lo referencia (references.characters / references.assets).`);
    }
  }

  // manhwa: audio.music_cues (cambio de cama musical a mitad del video). El render omite en silencio los
  // cues cuyo archivo no existe; aqui se atajan los errores de CONTRATO (escena inexistente, orden, exceso).
  const musicCues = rawJson?.audio?.music_cues;
  if (isManhwa && musicCues != null) {
    if (!Array.isArray(musicCues)) {
      errors.push("audio.music_cues debe ser un array de { at_scene, file }.");
    } else {
      const idxOf = new Map(sceneIds.map((id, i) => [id, i]));
      let prev = -1;
      for (const [i, cue] of musicCues.entries()) {
        const at = cleanString(cue?.at_scene);
        const file = cleanString(cue?.file);
        if (!at || !idxOf.has(at)) errors.push(`audio.music_cues[${i}]: at_scene "${at || "(vacio)"}" no existe en scenes[].`);
        if (!file) errors.push(`audio.music_cues[${i}]: falta file (ej. "music/manhwa_tension.mp3").`);
        else if (!file.startsWith("music/")) warnings.push(`audio.music_cues[${i}]: "${file}" no empieza con "music/" (biblioteca compartida); se resolvera relativo a public/<slug>/.`);
        const idx = idxOf.get(at);
        if (idx !== undefined) {
          if (idx <= prev) warnings.push(`audio.music_cues[${i}]: at_scene "${at}" no va DESPUES del cue anterior (deben seguir el orden de scenes[]).`);
          prev = Math.max(prev, idx);
        }
      }
      if (musicCues.length > 3) warnings.push(`audio.music_cues: ${musicCues.length} cambios de musica; max recomendado 2-3 por Parte (mas se siente robotico).`);
    }
  }

  const chars = rawJson?.characters && typeof rawJson.characters === "object" && !Array.isArray(rawJson.characters) ? rawJson.characters : {};
  for (const [cid, c] of Object.entries(chars)) {
    if (c?.reference_asset) validateCharacterAsset(errors, `characters.${cid}`, c.reference_asset, options.fileExists);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    parsed,
    project: parsed.project,
    scenes: parsed.scenes,
    preset,
    slug,
    provider: imageTool || "grok",
    imageProvider: imageTool || "grok",
    animationProvider: classicPreset ? animationProvider : (hasAnimated ? "grok" : "none"),
    hasAnimated,
  };
}
