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
  time_label?: string;
  voiceover?: { text?: string; words?: WordTs[] };
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
}

export interface CaptionStyle {
  font?: string;
  size?: number;
  position?: string;
}

export interface CapcutExport {
  clip_order?: string[];
  caption_style?: CaptionStyle;
  label_card_duration_s?: number; // duracion del cartel "DIA 1" antes de cada clip
}

// Linea de tiempo calculada en runtime por calculateMetadata (no va en el JSON de entrada).
export interface SceneTiming {
  id: string;
  cardFrames: number; // cartel "DIA 1" como overlay al inicio (no suma tiempo extra)
  sceneFrames: number; // duracion total de la escena (la manda la voz)
  clipWindow: number; // frames del clip visible (sceneFrames - cardFrames)
  playbackRate: number; // velocidad del clip para llenar la voz (<1 = camara lenta)
}

export interface ComputedTimeline {
  fps: number;
  hookFrames: number;
  scenes: SceneTiming[];
  totalFrames: number;
}

export interface ViralProps {
  project: ProjectMeta;
  hook?: HookData;
  scenes: SceneData[];
  audio?: AudioData;
  capcut_export?: CapcutExport;
  _timeline?: ComputedTimeline; // lo inyecta calculateMetadata
}
