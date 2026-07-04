// Tipos que el motor lee del JSON maestro.
// Solo se tipan los campos que el render usa; el resto del JSON se ignora sin romper.

export interface CaptionData {
  text: string;
  highlight_words?: string[];
}

// timestamp por palabra (segundos relativos al inicio del mp3 de voz).
// Opcional: si viene, el karaoke se sincroniza exacto; si no, reparte uniforme.
export interface WordTs {
  word: string;
  start: number;
  end: number;
}

export interface SfxCue {
  file: string; // archivo dentro de public/sfx/
  at_s?: number; // segundos desde que arranca el clip animado (default 0)
  volume?: number; // default 0.8
}

export interface SceneData {
  id: string;
  scene_id?: string; // schema nuevo historias: alias de id (el render usa id ?? scene_id)
  type?: "panel" | "narrative_card";
  card?: { text?: string; mode?: "editor" | "generated" };
  editor_motion?: EditorMotion;
  edition_motion?: EditorMotion; // alias tolerante; recomendado: editor_motion
  motion?: string;   // schema nuevo historias: motion top-level (alias de visual.motion)
  render_mode?: "static" | "animated"; // HIBRIDO criptoclaro_reel: "animated" = clip de video por escena; si falta/"static" = still + Ken Burns
  time_label?: string;
  intro_card?: string; // OPT-IN: cartel negro extra ANTES del contenido de la escena (excepciones a mano)
  intro_card_voice?: string; // OPT: mp3 en public/<slug>/voice/ que NARRA el cartel intro (ej "parte2.mp3"); dura lo que la voz
  // historias (image-only): hint de movimiento de camara Ken Burns sobre el still. Valores v2:
  // pan_lr (default) | pan_rl | tilt_down | static (fijo). Compat v1: pan_left_right/pan_right_left/
  // push_in/pull_out/static_hold. image_prompt lo usa el generador, no el render (se ignora sin romper).
  visual?: { image_prompt?: string; motion?: string };
  // historias v2: la cartela de texto YA viene pintada DENTRO del PNG; el render NO la dibuja (solo metadata).
  // Su presencia marca la escena como "punch" (fija + golpe de SFX) si hay capcut_export.punch_sfx.
  text_overlay?: { word?: string; baked_in_image?: boolean; static_hold?: boolean };
  voiceover?: { text?: string; words?: WordTs[] };
  _window?: { start: number; end: number }; // historias voz-continua: ventana (seg, raw Fish) de la escena sobre el audio maestro (lo inyecta align/inject-words.mjs)
  captions?: CaptionData;
  sfx?: SfxCue[];
  timeline?: { clip_duration_s?: number };
  edit_notes?: string;
}

export interface MontageSource {
  scene_id: string;
  clip_in_s: number;
  clip_out_s: number;
}

export interface HookData {
  duration_s: number;
  voiceover?: string;
  words?: WordTs[];
  montage_sources?: MontageSource[];
}

export interface ProjectMeta {
  title: string;
  slug?: string;
  preset?: string; // nombre del preset de estilo (ver src/viral/presets.ts)
  aspect_ratio?: string; // "9:16"
  fps?: number;
  default_clip_duration_s?: number; // duracion de los clips de Flow (default 4)
  grok_clip_seconds?: number; // novela-coreana: clips de Grok a 10s; fallback de default_clip_duration_s
  scene_target_seconds?: number; // novela-coreana: escenas cortas (~3s) -> RECORTA el clip a sus primeros N s (rate 1.0), no acelera
  // historias (image-only) — perillas de movimiento Ken Burns. Solo las lee el preset historias (gateado en el render).
  // Ausentes -> comportamiento actual. No afectan a otros presets (esos usan video, no KenBurnsImage).
  ken_pan?: number; // magnitud del paneo en % (default 5). Mas chico = paneo mas suave/lento.
  ken_zoom?: number; // overscale del still (default 1.14). Mas chico = se recorta MENOS el marco del codice (pero menos margen para panear).
  force_motion?: string; // si viene, TODAS las escenas usan este motion (ej "static" = video sin movimiento)
  no_static?: boolean; // remapea cualquier static a un ciclo de paneo (pan_lr/pan_rl/tilt_down): sin frames muertos
  crossfade_s?: number; // historias voz-continua: duracion de la disolvencia entre imagenes (default 0 = corte duro). Subir para re-activar la disolvencia.
  ken_motion?: boolean; // historias: re-activa el Ken Burns (paneo/zoom). Por defecto historias es ESTATICO (sin movimiento).
}

export interface AudioData {
  music_file?: string; // relativo a la carpeta del proyecto, ej "music/tenso.mp3"
  music_volume?: number; // default 0.18
  clip_volume?: number; // volumen del audio propio de las animaciones, default 0.1
  voice_rate?: number; // velocidad de la voz narrada, default 0.92 (un poco mas lenta)
  hook_sfx?: string; // click en cada corte del hook, default "click.mp3" (public/sfx/)
  hook_sfx_volume?: number; // default 1.8
  scene_sfx?: string; // flash al aparecer el cartel de cada escena, default "flash.mp3"
  scene_sfx_volume?: number; // default 1.25
  // historias voz-continua (lo inyecta align/inject-words.mjs, NO viene del JSON del usuario):
  _continuous?: boolean; // true -> el render usa 1 pista maestra de voz + ventanas por escena (sin costura)
  _master?: string; // ruta del mp3 maestro relativa a public/<slug>/ (ej "voice/full.mp3")
}

export interface CaptionStyle {
  font?: string;
  size?: number;
  position?: string;
  enabled?: boolean;
}

export interface EditingData {
  caption_style?: CaptionStyle;
  narrative_card_style?: { font?: string; size?: number; max_width?: string; max_lines?: number };
  panel_motion?: PanelMotionStyle;
}

export interface EditorMotion {
  enabled?: boolean;
  preset?: string;
  zoom?: number;
  pan?: number;
}

export interface PanelMotionStyle {
  enabled?: boolean;
  apply_to?: "all_panels" | "static_only" | "animated_only";
  static_zoom?: number;
  static_pan?: number;
  animated_zoom?: number;
  animated_pan?: number;
  cycle?: string[];
}

export interface CapcutExport {
  clip_order?: string[];
  caption_style?: CaptionStyle;
  label_card_duration_s?: number; // duracion del cartel "DIA 1" antes de cada clip
  title_cards?: { scene_id: string; text?: string }[]; // escenas que llevan cartel negro (intencion explicita del autor)
  // historias v2: escenas "beat" (fijas + golpe de tambor al entrar). punch_sfx = archivo en public/sfx/
  // (OPT-IN: sin el, no suena nada extra y no se rompe el render). Dispara en escenas con text_overlay
  // o cuyo id este en static_punch_scenes. Solo aplica al preset historias.
  static_punch_scenes?: string[];
  punch_sfx?: string;
  punch_sfx_volume?: number; // default 1.0
}

// Linea de tiempo calculada en runtime por calculateMetadata (no va en el JSON de entrada).
export interface SceneTiming {
  id: string;
  cardFrames: number; // cartel "DIA 1" como overlay al inicio (no suma tiempo extra)
  sceneFrames: number; // duracion total de la escena (la manda la voz)
  clipWindow: number; // frames del clip visible (sceneFrames - cardFrames)
  playbackRate: number; // velocidad del clip para llenar la voz (<1 = camara lenta)
  introFrames: number; // cartel intro opcional (scene.intro_card) ANTES del contenido; 0 si no hay
  startFrame?: number; // historias voz-continua: frame absoluto donde arranca la escena (su ventana sobre el audio maestro)
}

export interface ComputedTimeline {
  fps: number;
  hookFrames: number;
  scenes: SceneTiming[];
  totalFrames: number;
}

// Opening recurrente (preset novela-coreana): mismas escenas que scenes[], se reproducen PRIMERO,
// en el orden del array, antes de las escenas resueltas por clip_order. El render las trata igual.
export interface OpeningData {
  recurring?: boolean;
  // Opening COMPARTIDO por serie (opcional): carpeta base de los op_*.mp4/.mp3 en public/<assets_slug>/.
  // Asi cada Parte apunta al mismo opening sin copiar archivos. Ausente -> usa el slug del proyecto (cada
  // Parte trae sus propios op_* en su carpeta). Ej: "_openings/becaria_corp".
  assets_slug?: string;
  scenes: SceneData[];
}

export interface ViralProps {
  [key: string]: unknown;
  project: ProjectMeta;
  hook?: HookData;
  opening?: OpeningData;
  scenes: SceneData[];
  audio?: AudioData;
  editing?: EditingData;
  capcut_export?: CapcutExport;
  render_export?: CapcutExport; // schema nuevo historias: renombrado de capcut_export (mismo shape; el render usa render_export ?? capcut_export)
  _timeline?: ComputedTimeline; // lo inyecta calculateMetadata
}
