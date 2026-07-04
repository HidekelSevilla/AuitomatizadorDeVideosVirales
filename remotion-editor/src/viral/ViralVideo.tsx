import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  spring,
  interpolate,
  Easing,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import type { ViralProps, SceneData, WordTs, ComputedTimeline } from "./types";
import { getPreset, type Preset } from "./presets";
// @ts-expect-error  .mjs sin tipos: FUENTE UNICA del slug (debe coincidir con extension + dev-server)
import { slugify } from "../../../shared/slug.mjs";

const { fontFamily } = loadFont("normal", { weights: ["800", "900"], subsets: ["latin"] });

// defaults de la plantilla
const CLIP_VOL = 0; // audio propio del clip animado: SIEMPRE doblamos con voz+musica. Flow viene mudo, pero Grok genera el video CON sonido fuerte (-13 dB) que a 0.1 se colaba bajo la voz. El JSON puede subirlo con audio.clip_volume si se quiere ambiente.
const VOICE_RATE = 1.05; // voz un pelin mas rapida que natural (1 = natural). Antes 0.92 se sentia lenta.
const HOOK_SFX = "flash.mp3"; // flash en cada corte del hook (el usuario prefiere flash, no click)
const HOOK_SFX_VOL = 1.0; // volumen del flash del corte
const SCENE_SFX = "flash.mp3"; // flash al aparecer el cartel de cada escena (DIA 1...)
const SCENE_SFX_VOL = 1.25;
const CARD_SEC = 0.8;
const CLIP_ZOOM = 1.14; // recorta el borde inferior (anclado arriba) para quitar la marca de Flow
const HOOK_CUT_S = 0.8; // duracion objetivo de CADA flash del hook (rapido); se meten MAS flashes para llenar la voz, NO se estiran
const DEFAULT_MUSIC = "music/efecto_de_fondo.mp3"; // musica de fondo COMPARTIDA (public/music/) por defecto en todos los videos
const DEFAULT_MUSIC_VOL = 0.25; // bajado a 0.25 (a veces se escuchaba muy fuerte). Para silenciar un proyecto: audio.music_volume = 0
const KEN_ZOOM = 1.14; // overscale base del Ken Burns (deja margen para panear sin mostrar el borde del still)
const KEN_PAN = 5; // % de paneo del Ken Burns (cabe dentro del margen de KEN_ZOOM)
// historias (preset.stills) DEFAULTS (= "prueba 5" aprobada): paneo suave + overscale chico (no recorta el
// marco del codice) + todo en movimiento. El JSON puede sobreescribir con project.ken_pan/ken_zoom/no_static.
const HIST_PAN = 2;          // paneo por defecto en historias (mas lento/suave que KEN_PAN)
const HIST_ZOOM = 1.07;      // overscale por defecto en historias (recorta ~3% del marco, no 12%)
const HIST_MUSIC_VOL = 0.15; // musica por defecto en historias (mas baja)
const HIST_VOICE_RATE = 1.0; // playbackRate por defecto en historias = 1.0 (NO baja el tono). La lentitud va en Fish (voice_speed 0.95). voice_rate del JSON sigue mandando si se pone.
const HIST_XFADE_S = 0;      // historias: edicion estatica -> corte duro entre imagenes (sin disolvencia). El JSON puede subirlo con project.crossfade_s.
const HIST_CAPTION_SIZE = 72; // historias: karaoke un poco mas chico que el de costumbre (esqueletos ~128). El JSON puede sobreescribir con render_export.caption_style.size.
const CAPTION_GAP_HOLD_S = 0.16; // evita que la ultima palabra se quede pegada durante pausas largas.
const WAKE_INTRO_S = 1.3; // pov-historias: duracion del fundido de negro -> primera imagen al arranque ("despertar"). Fija.

// ---------- helpers ----------

const dimsFromAspect = (aspect: string): [number, number] => {
  if (aspect === "16:9") return [1920, 1080];
  if (aspect === "1:1") return [1080, 1080];
  if (aspect === "4:5") return [1080, 1350];
  return [1080, 1920];
};

const getSlug = (p: ViralProps): string => p.project.slug ?? slugify(p.project.title);

const norm = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const cleanWord = (w: string): string => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") || w;

// Quita marcadores de emocion/efecto de Fish ([nervous], [break], (excited)...) del TEXTO. Fish s2-pro
// NO los pronuncia ni los devuelve en el alignment (verificado), asi que el karaoke normal ya sale limpio;
// esto es la red de seguridad para el fallback sin timestamps (texto crudo) y para el hook.
const stripTags = (s?: string): string =>
  (s ?? "").replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

const NUMWORDS = new Set(
  ("uno una un dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte veintiuno veintiun veintiuna veintidos veintitres veinticuatro veinticinco veintiseis veintisiete veintiocho veintinueve treinta cuarenta cincuenta sesenta setenta ochenta noventa cien ciento cientos doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos mil millon millones y primero primer segundo tercero cuarto quinto").split(" ")
);
const isNumberWord = (w: string): boolean => NUMWORDS.has(norm(w)) || /^\d+$/.test(norm(w));

// Tokens normalizados de la etiqueta: "El gran viaje" -> ["el","gran","viaje"]; "Año 1521" -> ["ano","1521"].
const labelTokens = (label?: string): string[] => (label ? label.split(/\s+/).map(norm).filter(Boolean) : []);

// Cuantas palabras INICIALES de la narracion pertenecen a la etiqueta: coinciden token-a-token con la
// etiqueta, mas (tras la unidad) palabras-numero ("Año MIL QUINIENTOS VEINTIUNO" cuando la etiqueta trae "1521").
const labelLeadCount = (toks: string[], labelToks: string[]): number => {
  let i = 0;
  let li = 0;
  while (i < toks.length) {
    const w = norm(toks[i]);
    if (li < labelToks.length && w === labelToks[li]) { i++; li++; continue; }
    if (li > 0 && isNumberWord(toks[i])) { i++; continue; }
    break;
  }
  return i;
};

// Fish manda el alignment ACUMULATIVO por chunk; al concatenar snapshots el .words.json sale con la
// frase DUPLICADA (timestamps que reinician en 0). Nos quedamos con el ULTIMO snapshot completo:
// partimos donde el start RETROCEDE y devolvemos el segmento mas largo (el final, con la frase entera).
const dedupeWords = (words?: WordTs[]): WordTs[] | undefined => {
  if (!words || words.length < 2) return words;
  const snaps: WordTs[][] = [];
  let cur: WordTs[] = [];
  let prev = -Infinity;
  for (const w of words) {
    if (w.start < prev - 0.05) { if (cur.length) snaps.push(cur); cur = []; }
    cur.push(w);
    prev = w.start;
  }
  if (cur.length) snaps.push(cur);
  return snaps.reduce((a, b) => (b.length >= a.length ? b : a), snaps[0]);
};

// quita las palabras del time_label (ej "Dia uno") del subtitulo: ya las muestra el cartel
const stripLabelWords = (
  words: WordTs[] | undefined,
  text: string | undefined,
  label?: string
): { words?: WordTs[]; text?: string } => {
  if (!label) return { words, text };
  const labelToks = labelTokens(label);
  if (words && words.length) {
    const sliced = words.slice(labelLeadCount(words.map((w) => w.word), labelToks));
    return { words: sliced, text: sliced.map((w) => w.word).join(" ") };
  }
  const toks = (text ?? "").trim().split(/\s+/).filter(Boolean);
  return { words: undefined, text: toks.slice(labelLeadCount(toks, labelToks)).join(" ") };
};

// ¿la VOZ narra el time_label? (la primera palabra hablada es la unidad: "Dia", "Minuto"...).
// El cartel negro (pantalla) se muestra SOLO si la voz lo narra. Asi las escenas internas que NO
// dicen el label (ej "Sacas tu carrito...") no cortan con pantalla; solo lo hacen los cambios
// grandes narrados ("Dia dos..."). El otro chat lo controla con solo narrar o no el label.
const labelNarrated = (
  words: WordTs[] | undefined,
  text: string | undefined,
  label?: string
): boolean => {
  if (!label) return false;
  const unit = norm(label.split(/\s+/)[0]);
  if (!unit) return false;
  const first =
    words && words.length
      ? norm(words[0].word)
      : norm(stripTags(text ?? "").trim().split(/\s+/)[0] ?? ""); // ignora [nervous]/(...) inicial
  return first === unit;
};

// ---------- duracion: la manda la voz; el clip se estira para llenarla ----------

// --- schema nuevo historias: render_export renombra capcut_export; scene_id/motion alias de id/visual.motion.
//     Se lee el nombre NUEVO con fallback al viejo -> acepta AMBOS schemas sin romper JSONs existentes. ---
const xport = (p: ViralProps) => p.render_export ?? p.capcut_export;
const sceneId = (s: SceneData) => s.id ?? s.scene_id ?? "";
const sceneMotion = (s: SceneData) => s.visual?.motion ?? s.motion;
// HIBRIDO criptoclaro_reel: una escena con render_mode "animated" se dibuja como CLIP de video (no still + Ken Burns).
const isAnimatedScene = (s: SceneData) => s.render_mode === "animated";
const isManhwa = (p: ViralProps) => p.project.preset === "manhwa";
const isNarrativeCard = (s: SceneData) => s.type === "narrative_card";
const isEditorNarrativeCard = (s: SceneData) => isNarrativeCard(s) && (s.card?.mode ?? "editor") !== "generated";
const captionStyle = (p: ViralProps) => isManhwa(p) ? (p.editing?.caption_style ?? xport(p)?.caption_style) : xport(p)?.caption_style;
const captionsEnabled = (p: ViralProps, preset: Preset) =>
  isManhwa(p) ? (captionStyle(p)?.enabled !== false) : (!preset.stills || !!preset.captions);
const SceneClip: React.FC<{ slug: string; id: string }> = ({ slug, id }) => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    <OffthreadVideo src={staticFile(`${slug}/clips/${id}.mp4`)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  </AbsoluteFill>
);

export const calcViralMetadata: CalculateMetadataFunction<ViralProps> = async ({ props }) => {
  const fps = props.project.fps ?? 24;
  // historias es documental HORIZONTAL: si el JSON no declara aspect_ratio, default 16:9 (no vertical en
  // silencio). Un aspect_ratio explicito sigue mandando (ej. reels 9:16 derivados). Otros presets: 9:16.
  const defaultAspect = (props.project.preset === "historias" || props.project.preset === "criptoclaro") ? "16:9" : "9:16";
  const [width, height] = dimsFromAspect(props.project.aspect_ratio ?? defaultAspect);
  const slug = getSlug(props);
  const preset = getPreset(props.project.preset);
  const baseCard = preset.showLabelCard
    ? Math.round((xport(props)?.label_card_duration_s ?? CARD_SEC) * fps)
    : 0;
  // historias: voz a 1.0 (documental; se respeta la lentitud de Fish y no se comprime la escena). Otros: 1.05.
  const voiceRate = props.audio?.voice_rate ?? (preset.stills ? HIST_VOICE_RATE : VOICE_RATE);
  const defClip = props.project.default_clip_duration_s ?? props.project.grok_clip_seconds ?? 4;
  // opening (novela-coreana): sus escenas van PRIMERO, en orden de array; luego scenes por clip_order.
  // Sin opening (esqueletos/frutinovelas) -> order y byId quedan identicos al flujo de hoy.
  const openingScenes = props.opening?.scenes ?? [];
  // Opening compartido por serie: sus medios viven en public/<assets_slug>/ (fallback: el slug del proyecto).
  const openingSlug = props.opening?.assets_slug ?? slug;
  const openingIds = new Set(openingScenes.map(sceneId));
  const baseFor = (id: string): string => (openingIds.has(id) ? openingSlug : slug);
  const order = [
    ...openingScenes.map(sceneId),
    ...(xport(props)?.clip_order ?? props.scenes.map(sceneId)),
  ];
  const byId = Object.fromEntries([...openingScenes, ...props.scenes].map((s) => [sceneId(s), s]));

  // ---- historias VOZ-CONTINUA: 1 mp3 maestro + ventana {start,end} por escena (de los timestamps de Fish,
  // inyectadas por align/inject-words.mjs). El timing NO sale de ffprobe por escena sino del mapa. La voz
  // suena continua (sin costura por corte). Gateado por audio._continuous (lo pone el builder). ----
  if (preset.stills && props.audio?._continuous && props.audio?._master) {
    let fullDur = 0;
    try { fullDur = await getAudioDurationInSeconds(staticFile(`${slug}/${props.audio._master}`)); } catch { /* sin audio: degrada */ }
    const cont = order.map((id) => {
      const win = byId[id]?._window ?? { start: 0, end: fullDur };
      const startF = Math.round((win.start / voiceRate) * fps);
      const endF = Math.round(((win.end || fullDur) / voiceRate) * fps);
      const frames = Math.max(1, endF - startF);
      return { id, cardFrames: 0, sceneFrames: frames, clipWindow: frames, playbackRate: 1, introFrames: 0, startFrame: startF };
    });
    const lastEnd = cont.length ? cont[cont.length - 1].startFrame + cont[cont.length - 1].sceneFrames : 1;
    const totalFrames = Math.max(Math.round((fullDur / voiceRate) * fps), lastEnd, 1);
    // la ultima imagen se queda hasta el fin del audio (sin cola negra mientras suena el remate).
    if (cont.length) { const L = cont[cont.length - 1]; L.sceneFrames = Math.max(1, totalFrames - L.startFrame); L.clipWindow = L.sceneFrames; }
    return {
      durationInFrames: totalFrames,
      fps, width, height,
      props: { ...props, _timeline: { fps, hookFrames: 0, scenes: cont, totalFrames } },
    };
  }

  const scenes = [] as ComputedTimeline["scenes"];
  for (const id of order) {
    const sc = byId[id];
    // cartel negro SOLO si la VOZ narra el time_label (flujo estandar; las escenas internas no lo cortan).
    // Dura lo que TARDA esa narracion (y se le quita el label al subtitulo). La voz va a voiceRate.
    const dwords = dedupeWords(sc?.voiceover?.words);
    let cardFrames = 0;
    if (baseCard > 0 && labelNarrated(dwords, sc?.voiceover?.text, sc?.time_label)) {
      const n = labelLeadCount((dwords ?? []).map((w) => w.word), labelTokens(sc?.time_label));
      const timedLabel = !!dwords && dwords.length > 0 && dwords[0].start >= 0 && n > 0;
      cardFrames = timedLabel
        ? Math.max(Math.round((dwords![Math.min(n, dwords!.length) - 1].end / voiceRate) * fps), baseCard)
        : baseCard;
    }
    // cartel intro OPCIONAL (opt-in scene.intro_card) ANTES del contenido. Escenas sin intro_card ->
    // introFrames 0 -> identico al flujo estandar. Si trae intro_card_voice, dura lo que esa voz (narrado).
    let introFrames = sc?.intro_card ? baseCard : 0;
    if (sc?.intro_card && sc?.intro_card_voice) {
      try {
        const introSec = await getAudioDurationInSeconds(staticFile(`${baseFor(id)}/voice/${sc.intro_card_voice}`));
        if (introSec > 0) introFrames = Math.round((introSec / voiceRate + 0.3) * fps);
      } catch { /* sin voz: usa baseCard (silencioso) */ }
    }
    let voiceSec = defClip;
    try {
      voiceSec = await getAudioDurationInSeconds(staticFile(`${baseFor(id)}/voice/${id}.mp3`));
    } catch {
      voiceSec = defClip;
    }
    const effVoice = Math.max(1, Math.round((voiceSec / voiceRate) * fps));
    const contentFrames = Math.max(effVoice, cardFrames + Math.round(0.4 * fps));
    const sceneFrames = introFrames + contentFrames;
    const clipWindow = contentFrames - cardFrames;
    const clipDur = byId[id]?.timeline?.clip_duration_s ?? defClip;
    // novela-coreana SIN scene_target_seconds: clips ~10s (mas largos que la voz) -> permitir acelerar
    // (techo 1.3x) para mostrar el clip completo sin truncarlo.
    // novela-coreana CON scene_target_seconds (escenas cortas ~3s, clips 6s): NO acelerar -> techo 1.0;
    // el Sequence (durationInFrames=clipWindow, startFrom 0) RECORTA el clip a sus primeros clipWindow
    // frames, igual que el hook. Asi no se congela ni se acelera. Otros presets: techo 1 (intacto).
    const novelaTrim = props.project.preset === "novela-coreana"
      && typeof props.project.scene_target_seconds === "number" && props.project.scene_target_seconds > 0;
    const rateCeiling = (props.project.preset === "novela-coreana" && !novelaTrim) ? 1.3 : 1;
    const playbackRate = Math.max(0.5, Math.min(rateCeiling, (clipDur * fps) / clipWindow));
    scenes.push({ id, cardFrames, sceneFrames, clipWindow, playbackRate, introFrames });
  }

  // El hook dura lo que TARDA su voz (a voiceRate) + cola corta -> nunca se corta la narracion del hook
  // ni queda silencio largo. Fallback a hook.duration_s si no hay/lee la voz del hook.
  let hookFrames = Math.round((props.hook?.duration_s ?? 0) * fps);
  if (props.hook) {
    try {
      const hookVoiceSec = await getAudioDurationInSeconds(staticFile(`${slug}/voice/hook.mp3`));
      if (hookVoiceSec > 0) hookFrames = Math.round((hookVoiceSec / voiceRate + 0.3) * fps);
    } catch { /* sin voz de hook: usa duration_s */ }
  }
  const totalFrames = hookFrames + scenes.reduce((a, s) => a + s.sceneFrames, 0);

  return {
    durationInFrames: totalFrames,
    fps,
    width,
    height,
    props: { ...props, _timeline: { fps, hookFrames, scenes, totalFrames } },
  };
};

// ---------- karaoke: UNA palabra a la vez ----------

const OUTLINE =
  "-5px -5px 0 #000,5px -5px 0 #000,-5px 5px 0 #000,5px 5px 0 #000,0 0 10px #000,0 8px 16px rgba(0,0,0,.6)";

const Karaoke: React.FC<{
  text?: string;
  words?: WordTs[];
  windowFrames: number;
  voiceRate: number;
  preset: Preset;
  hot?: string[];
  bottom?: number;
  size?: number;
}> = ({ text, words, windowFrames, voiceRate, preset, hot = [], bottom = 380, size = 132 }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const list = useMemo(() => {
    if (words && words.length) return words;
    const ws = stripTags(text ?? "").trim().split(/\s+/).filter(Boolean);
    return ws.map((w) => ({ word: w, start: -1, end: -1 })) as WordTs[];
  }, [text, words]);
  const hotSet = useMemo(
    () => new Set(hot.flatMap((h) => h.split(/\s+/)).map(norm).filter(Boolean)),
    [hot]
  );

  const timed = list.length > 0 && list[0].start >= 0;

  if (list.length === 0) return null;

  // Palabra activa global (misma logica de sync que antes).
  let idx: number;
  let wordStartFrame: number;
  if (timed) {
    const audioT = (frame / fps) * voiceRate; // posicion real dentro del mp3 (esta ralentizado)
    idx = list.findIndex((w) => audioT >= w.start && audioT < w.end);
    if (idx < 0) {
      // En pausas cortas sostiene la ultima palabra; en pausas largas desaparece para no sentirse atrasado.
      let lastIdx = -1;
      for (let i = 0; i < list.length; i++) { if (list[i].start <= audioT) lastIdx = i; else break; }
      if (lastIdx < 0 || audioT > list[lastIdx].end + CAPTION_GAP_HOLD_S) return null;
      idx = lastIdx;
    }
    wordStartFrame = (list[idx].start / voiceRate) * fps;
  } else {
    const per = windowFrames / list.length;
    idx = Math.max(0, Math.min(list.length - 1, Math.floor(frame / per)));
    wordStartFrame = idx * per;
  }

  // UNA sola palabra a la vez (la activa), con pop SUAVE al entrar (antes era muy brusco/rapido).
  const pop = spring({ frame: frame - wordStartFrame, fps, config: { damping: 24, stiffness: 130, mass: 0.6 } });
  const word = cleanWord(list[idx].word);
  const isHot = hotSet.has(norm(word));
  // Auto-encoge palabras largas para que NUNCA se salgan del cuadro (ej. "ACERCÁNDOSE"). ~0.8em/char en
  // Montserrat 900 mayuscula + margen para el contorno y el pop. Las cortas se quedan en el tamano normal.
  const fitSize = Math.max(48, Math.min(size, Math.floor((width * 0.78) / (word.length * 0.8))));

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: bottom }}>
      <span
        style={{
          display: "inline-block",
          transform: `scale(${0.9 + 0.1 * pop})`,
          transformOrigin: "center bottom",
          fontFamily, fontWeight: 900, fontSize: fitSize, letterSpacing: -1, lineHeight: 1.02,
          textTransform: "uppercase", textAlign: "center", whiteSpace: "nowrap",
          color: isHot ? preset.captionHotBg : preset.captionBase,
          maxWidth: "92%", padding: "0 24px",
          WebkitTextStroke: `${Math.round(fitSize * 0.09)}px #000`,
          paintOrder: "stroke fill",
          textShadow: "0 12px 26px rgba(0,0,0,.8), 0 3px 8px rgba(0,0,0,.95)",
        }}
      >
        {word}
      </span>
    </AbsoluteFill>
  );
};

// ---------- cartel "DIA 1" (overlay; la voz lo dice mientras se ve) ----------

const LabelCard: React.FC<{ label?: string; preset: Preset }> = ({ label, preset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  return (
    <AbsoluteFill
      style={{ backgroundColor: preset.labelCardBg, justifyContent: "center", alignItems: "center" }}
    >
      <div
        style={{
          transform: `scale(${0.8 + 0.2 * pop})`,
          fontFamily,
          fontWeight: 900,
          fontSize: 140,
          letterSpacing: 4,
          lineHeight: 1.05,
          color: preset.labelCardColor,
          textTransform: "uppercase",
          textAlign: "center",
          maxWidth: "86%",
          padding: "0 48px",
        }}
      >
        {label ?? ""}
      </div>
    </AbsoluteFill>
  );
};

const WEBTOON_CARD_FONT = '"Comic Sans MS", "Segoe Print", "Comic Neue", "Trebuchet MS", sans-serif';

const splitNarrativeCardLines = (text: string, maxLines: number): string[] => {
  const manual = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (manual.length > 1) return manual.slice(0, maxLines);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lineCount = Math.min(maxLines, Math.max(1, Math.ceil(words.length / 3)));
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const remainingWords = words.length;
    const remainingLines = lineCount - i;
    const take = Math.ceil(remainingWords / remainingLines);
    lines.push(words.splice(0, take).join(" "));
  }
  return lines.filter(Boolean);
};

const narrativeCardFontSize = (base: number, lines: string[], width: number, height: number): number => {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const byWidth = (width * 0.64) / longest;
  const byHeight = (height * 0.18) / Math.max(1, lines.length);
  return Math.round(Math.max(42, Math.min(base, byWidth, byHeight)));
};

const NarrativeCard: React.FC<{ text?: string; preset: Preset; frames: number; props: ViralProps }> = ({ text, preset, frames, props }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const fade = Math.min(Math.round(0.28 * fps), Math.max(1, Math.floor(frames / 2)));
  const fadeIn = interpolate(frame, [0, fade], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [Math.max(0, frames - fade - 1), Math.max(1, frames - 1)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const style = isManhwa(props) ? undefined : props.editing?.narrative_card_style;
  const lines = splitNarrativeCardLines(text ?? "", style?.max_lines ?? 4);
  const fontSize = narrativeCardFontSize(style?.size ?? 96, lines, width, height);
  return (
    <AbsoluteFill style={{ backgroundColor: "black", justifyContent: "center", alignItems: "center", opacity: Math.min(fadeIn, fadeOut) }}>
      <div
        style={{
          fontFamily: style?.font || preset.narrativeCardFont || WEBTOON_CARD_FONT,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.08,
          letterSpacing: 0,
          color: preset.labelCardColor,
          textAlign: "center",
          width: style?.max_width ?? "72%",
          maxWidth: "900px",
          whiteSpace: "pre-wrap",
          textTransform: "uppercase",
          textWrap: "balance",
          overflowWrap: "break-word",
          transform: "translateY(-2%)",
          textShadow: "0 2px 0 rgba(255,255,255,0.08)",
        }}
      >
        {lines.join("\n")}
      </div>
    </AbsoluteFill>
  );
};

// ---------- destello blanco rapido (sincronizado con el flash de cada corte del hook) ----------

const FlashOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 5], [0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (op <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: "white", opacity: op }} />;
};

// ---------- fundido de negro -> imagen al ARRANQUE del video (pov-historias: efecto "despertar") ----------
// Capa negra a pantalla completa cuya opacidad va de 1 -> 0 en los primeros WAKE_INTRO_S. Puramente visual:
// no retrasa audio ni el inicio real de la escena 1, solo la tapa durante el fundido. Gateado por preset.wakeIntro.

const WakeIntroOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = interpolate(frame, [0, Math.round(WAKE_INTRO_S * fps)], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  if (op <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: "black", opacity: op }} />;
};

// ---------- Ken Burns: MOVIMIENTO DE CAMARA sobre un still (preset historias) ----------
// La imagen NO se anima (el arte de codice es plano); todo el movimiento es paneo/zoom lento del editor,
// que arranca al inicio de la ventana de la escena y termina al acabar el audio (easing suave).

const kenBurnsTransform = (motion: string | undefined, p: number, pan: number = KEN_PAN, zoom: number = KEN_ZOOM): string => {
  let scale = zoom;
  let x = 0;
  let y = 0;
  switch (motion) {
    // v2: solo paneos + fijo (sin zoom). Acepta nombres v2 (pan_lr/pan_rl/static) y los v1 (compat).
    // `pan` (% de paneo) y `zoom` (overscale) los puede bajar el JSON (project.ken_pan / ken_zoom):
    // menos zoom = se recorta menos el marco del codice; menos pan = paneo mas suave.
    case "pan_lr": case "pan_left_right": x = interpolate(p, [0, 1], [pan, -pan]); break;
    case "pan_rl": case "pan_right_left": x = interpolate(p, [0, 1], [-pan, pan]); break;
    case "tilt_down": y = interpolate(p, [0, 1], [-pan, pan]); break;
    case "bottom_to_top": y = interpolate(p, [0, 1], [pan, -pan]); break;
    case "top_to_bottom": y = interpolate(p, [0, 1], [-pan, pan]); break;
    case "bottom_left_to_top_right": x = interpolate(p, [0, 1], [pan, -pan]); y = interpolate(p, [0, 1], [pan, -pan]); break;
    case "bottom_right_to_top_left": x = interpolate(p, [0, 1], [-pan, pan]); y = interpolate(p, [0, 1], [pan, -pan]); break;
    case "top_left_to_bottom_right": x = interpolate(p, [0, 1], [pan, -pan]); y = interpolate(p, [0, 1], [-pan, pan]); break;
    case "top_right_to_bottom_left": x = interpolate(p, [0, 1], [-pan, pan]); y = interpolate(p, [0, 1], [-pan, pan]); break;
    case "static": case "static_hold": scale = 1; break; // FIJO: sin movimiento ni zoom (frame quieto)
    case "slow_pull_out":
    case "pull_out": scale = interpolate(p, [0, 1], [zoom + 0.05, 1.0]); break; // compat v1 (zoom out)
    case "slow_push_in":
    case "push_in": scale = interpolate(p, [0, 1], [1.0, zoom]); break;         // compat v1 (zoom in)
    default: x = interpolate(p, [0, 1], [pan, -pan]); break; // sin motion -> pan_lr (v2 nunca usa zoom)
  }
  return `scale(${scale}) translate(${x}%, ${y}%)`;
};

// historias A/B (gateado por el caller a preset.stills): resuelve el motion final de una escena.
//  - project.force_motion: si viene, TODAS las escenas usan ese motion (ej "static" = video sin movimiento).
//  - project.no_static: cualquier static/sin-motion pasa a un ciclo de paneo (pan_lr/pan_rl/tilt_down) -> sin frames muertos.
// Ausentes -> devuelve el motion tal cual (comportamiento actual). Otros presets nunca llaman aqui.
const MOTION_CYCLE = ["pan_lr", "pan_rl", "tilt_down"];
const MANHWA_EDITOR_MOTION_CYCLE = [
  "bottom_to_top",
  "top_to_bottom",
  "bottom_left_to_top_right",
  "top_right_to_bottom_left",
  "slow_push_in",
];
const resolveMotion = (
  motion: string | undefined,
  index: number,
  project: ViralProps["project"],
  stills = false // historias: edicion estatica por defecto (sin Ken Burns). Otros presets: false.
): string | undefined => {
  if (project.force_motion) return project.force_motion;
  if (project.preset === "manhwa") return motion || "static";
  // historias: TODO estatico por defecto (ignora el motion de la escena). El JSON re-activa el Ken Burns con project.ken_motion:true.
  if (stills && !project.ken_motion) return "static";
  const noStatic = project.no_static ?? false;
  if (noStatic && (!motion || motion === "static" || motion === "static_hold")) {
    return MOTION_CYCLE[index % MOTION_CYCLE.length];
  }
  return motion;
};

type PanelMotionRuntime = { enabled: boolean; preset: string; pan: number; zoom: number };

const panelMotionFor = (
  props: ViralProps,
  scene: SceneData,
  index: number,
  animated: boolean
): PanelMotionRuntime | null => {
  if (!isManhwa(props) || isNarrativeCard(scene)) return null;
  const global = props.editing?.panel_motion;
  const local = scene.editor_motion || scene.edition_motion;
  const enabled = local?.enabled ?? global?.enabled ?? true;
  const applyTo = global?.apply_to ?? "all_panels";
  const applies = applyTo === "all_panels" || (applyTo === "static_only" && !animated) || (applyTo === "animated_only" && animated);
  if (!enabled || (!local && !applies)) return { enabled: false, preset: "static", pan: 0, zoom: 1 };
  const cycle = global?.cycle?.length ? global.cycle : MANHWA_EDITOR_MOTION_CYCLE;
  const preset = local?.preset || cycle[index % cycle.length] || "bottom_to_top";
  const pan = local?.pan ?? (animated ? global?.animated_pan : global?.static_pan) ?? (animated ? 2 : 4);
  const zoom = local?.zoom ?? (animated ? global?.animated_zoom : global?.static_zoom) ?? (animated ? 1.02 : 1.04);
  return { enabled: true, preset, pan, zoom };
};

const motionNameFor = (
  props: ViralProps,
  scene: SceneData,
  index: number,
  animated: boolean,
  preset: Preset
): string | undefined => {
  const pm = panelMotionFor(props, scene, index, animated);
  if (pm) return pm.enabled ? pm.preset : "static";
  return resolveMotion(sceneMotion(scene), index, props.project, preset.stills);
};

const motionPanFor = (props: ViralProps, scene: SceneData, index: number, animated: boolean, fallback?: number): number | undefined => {
  const pm = panelMotionFor(props, scene, index, animated);
  if (pm) return pm.pan;
  return fallback;
};

const motionZoomFor = (props: ViralProps, scene: SceneData, index: number, animated: boolean, fallback?: number): number | undefined => {
  const pm = panelMotionFor(props, scene, index, animated);
  if (pm) return pm.zoom;
  return fallback;
};

const KenBurnsImage: React.FC<{ src: string; motion?: string; windowFrames: number; pan?: number; zoom?: number }> = ({
  src,
  motion,
  windowFrames,
  pan,
  zoom,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, Math.max(1, windowFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: kenBurnsTransform(motion, p, pan, zoom),
          transformOrigin: "50% 50%",
        }}
      />
    </AbsoluteFill>
  );
};

const EditorMotionFrame: React.FC<{
  motion?: string;
  windowFrames: number;
  pan?: number;
  zoom?: number;
  children: React.ReactNode;
}> = ({ motion, windowFrames, pan, zoom, children }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, Math.max(1, windowFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: kenBurnsTransform(motion, p, pan, zoom),
          transformOrigin: "50% 50%",
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Disolvencia de entrada: la imagen aparece subiendo su opacidad de 0 a 1 en `frames`. Como la escena
// siguiente se solapa con el final de la anterior y va ENCIMA, el resultado es un crossfade (sin corte duro).
const FadeIn: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const opacity = frames > 0
    ? interpolate(f, [0, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// ---------- hook: montage + flash en cada corte + karaoke ----------

const Hook: React.FC<{ props: ViralProps; preset: Preset }> = ({ props, preset }) => {
  const t = props._timeline!;
  const slug = getSlug(props);
  // Montage del hook: flashes CORTOS (~HOOK_CUT_S c/u); se meten TANTOS como haga falta para llenar la voz
  // del hook -> NO se estiran los pedazos, se agregan mas escenas. Pool: primero las montage_sources
  // curadas, luego el resto de escenas (clip_order) para variedad; si faltan, cicla.
  const curated = props.hook?.montage_sources ?? [];
  const order = xport(props)?.clip_order ?? props.scenes.map(sceneId);
  const usedIds = new Set(curated.map((s) => s.scene_id));
  const extra = order
    .filter((id) => !usedIds.has(id))
    .map((id, j) => ({ scene_id: id, clip_in_s: 0.8 + (j % 3) * 0.4 }));
  const pool = [...curated, ...extra];
  const pieceCount = pool.length
    ? Math.max(2, Math.min(12, Math.round(t.hookFrames / t.fps / HOOK_CUT_S)))
    : 0;
  const pieces = Array.from({ length: pieceCount }, (_, i) => pool[i % pool.length]);
  const clipVol = props.audio?.clip_volume ?? CLIP_VOL;
  const voiceRate = props.audio?.voice_rate ?? (preset.stills ? HIST_VOICE_RATE : VOICE_RATE); // historias: voz native (documental)
  const hookSfx = props.audio?.hook_sfx ?? HOOK_SFX;
  const hookVol = props.audio?.hook_sfx_volume ?? HOOK_SFX_VOL;
  const { height: vh } = useVideoConfig();
  // historias (16:9): subtitulo lower-third mas chico, respeta caption_style.size. Otros presets: VALORES
  // EXACTOS de antes (no leemos caption_style para no cambiar el look de esqueletos/novela ya en produccion).
  const capSize = preset.stills ? (captionStyle(props)?.size ?? HIST_CAPTION_SIZE) : 120;
  const capBottom = preset.stills ? Math.round(vh * 0.08) : 360;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {pieceCount > 0 &&
        (() => {
          const per = Math.floor(t.hookFrames / pieceCount);
          let from = 0;
          return pieces.map((src, i) => {
            const dur = i === pieceCount - 1 ? t.hookFrames - per * (pieceCount - 1) : per;
            const seq = (
              <Sequence key={i} from={from} durationInFrames={dur}>
                {preset.stills ? (
                  <KenBurnsImage
                    src={staticFile(`${slug}/images/${src.scene_id}.jpg`)}
                    motion="pan_lr"
                    windowFrames={dur}
                    pan={props.project.ken_pan ?? (preset.stills ? HIST_PAN : undefined)}
                    zoom={props.project.ken_zoom ?? (preset.stills ? HIST_ZOOM : undefined)}
                  />
                ) : (
                  <AbsoluteFill style={{ transform: `scale(${CLIP_ZOOM})`, transformOrigin: "50% 0%" }}>
                    <OffthreadVideo
                      src={staticFile(`${slug}/clips/${src.scene_id}.mp4`)}
                      startFrom={Math.round(src.clip_in_s * t.fps)}
                      volume={clipVol}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </AbsoluteFill>
                )}
                {i > 0 && hookSfx && (
                  <Audio src={staticFile(`sfx/${hookSfx}`)} volume={hookVol} />
                )}
                {i > 0 && <FlashOverlay />}
              </Sequence>
            );
            from += dur;
            return seq;
          });
        })()}
      <Audio src={staticFile(`${slug}/voice/hook.mp3`)} playbackRate={voiceRate} />
      {/* preset.captions (historias): SI dibuja karaoke (sin texto horneado). criptoclaro/habitos: off (texto baked). */}
      {captionsEnabled(props, preset) && (
        <Karaoke
          text={props.hook?.voiceover}
          words={dedupeWords(props.hook?.words)}
          windowFrames={t.hookFrames}
          voiceRate={voiceRate}
          preset={preset}
          bottom={capBottom}
          size={capSize}
        />
      )}
    </AbsoluteFill>
  );
};

// ---------- escena ----------

const Scene: React.FC<{
  props: ViralProps;
  scene: SceneData;
  timing: ComputedTimeline["scenes"][number];
  preset: Preset;
  assetSlug: string; // base de medios (clips/voz) de ESTA escena: opening compartido o slug del proyecto
  sceneIndex: number; // posicion en el orden -> para el ciclo de paneo de no_static
  continuous: boolean; // historias voz-continua: el audio es 1 pista maestra global -> la escena NO pone su mp3
}> = ({ props, scene, timing, preset, assetSlug, sceneIndex, continuous }) => {
  const { fps, height: vh } = useVideoConfig();
  const slug = assetSlug;
  const clipVol = props.audio?.clip_volume ?? CLIP_VOL;
  // historias: voz a 1.0 (documental, se respeta la lentitud generada en Fish). Otros presets: 1.05 como antes.
  const voiceRate = props.audio?.voice_rate ?? (preset.stills ? HIST_VOICE_RATE : VOICE_RATE);
  const sceneSfx = props.audio?.scene_sfx ?? SCENE_SFX;
  const sceneVol = props.audio?.scene_sfx_volume ?? SCENE_SFX_VOL;
  // historias v2: escena "punch" (fija + golpe de tambor al entrar) si trae text_overlay o esta en
  // static_punch_scenes. El SFX es OPT-IN (capcut_export.punch_sfx, archivo en public/sfx/): sin el, no
  // suena nada y no se rompe el render. Gateado a preset.stills -> otros presets intactos.
  const punchSfx = xport(props)?.punch_sfx;
  const isPunch = preset.stills && !!punchSfx &&
    (!!scene.text_overlay || (xport(props)?.static_punch_scenes ?? []).includes(sceneId(scene)));
  // historias (16:9): subtitulo lower-third mas chico, respeta caption_style.size. Otros presets: VALORES
  // EXACTOS de antes (no leemos caption_style para no cambiar el look de esqueletos/novela ya en produccion).
  const capSize = preset.stills ? (captionStyle(props)?.size ?? HIST_CAPTION_SIZE) : 128;
  const capBottom = preset.stills ? Math.round(vh * 0.08) : 380;
  const { cardFrames, sceneFrames, clipWindow, playbackRate, introFrames } = timing;
  const contentFrames = sceneFrames - introFrames;
  const sub = stripLabelWords(
    dedupeWords(scene.voiceover?.words),
    stripTags(scene.voiceover?.text ?? scene.captions?.text),
    scene.time_label
  );

  return (
    // voz-continua: fondo TRANSPARENTE -> la imagen viene de la capa de crossfade (debajo); aqui solo el caption.
    <AbsoluteFill style={{ backgroundColor: continuous ? "transparent" : "black" }}>
      {/* cartel intro OPCIONAL (silencioso) ANTES del contenido, con flash. Solo si scene.intro_card. */}
      {introFrames > 0 && (
        <Sequence from={0} durationInFrames={introFrames}>
          {sceneSfx && <Audio src={staticFile(`sfx/${sceneSfx}`)} volume={sceneVol} />}
          {scene.intro_card_voice && (
            <Audio src={staticFile(`${slug}/voice/${scene.intro_card_voice}`)} playbackRate={voiceRate} />
          )}
          {/* historias: el cartel va horneado en la imagen -> no se dibuja desde Remotion. */}
          {!preset.stills && <LabelCard label={scene.intro_card} preset={preset} />}
        </Sequence>
      )}

      {/* contenido de la escena, desplazado por el cartel intro (introFrames=0 => sin desplazar) */}
      <Sequence from={introFrames} durationInFrames={contentFrames}>
        <AbsoluteFill style={{ backgroundColor: continuous ? "transparent" : "black" }}>
          {/* voz: arranca con el contenido (suena durante el cartel narrado -> sincroniza "DIA 1").
              historias voz-continua: el audio es 1 pista maestra global (en ViralVideo) -> aqui NO se pone. */}
          {!continuous && <Audio src={staticFile(`${slug}/voice/${sceneId(scene)}.mp3`)} playbackRate={voiceRate} />}
          {/* historias v2: golpe de tambor al ENTRAR la escena punch (cartel baked + fija). Opt-in. */}
          {isPunch && <Audio src={staticFile(`sfx/${punchSfx}`)} volume={xport(props)?.punch_sfx_volume ?? 1.0} />}
          {/* flash al aparecer el cartel narrado de la escena */}
          {sceneSfx && cardFrames > 0 && <Audio src={staticFile(`sfx/${sceneSfx}`)} volume={sceneVol} />}
          {/* sfx puntuales (at_s relativo al inicio del contenido) */}
          {(scene.sfx ?? []).map((cue, i) => (
            <Sequence key={i} from={Math.round((cue.at_s ?? 0) * fps)}>
              <Audio src={staticFile(`sfx/${cue.file}`)} volume={cue.volume ?? 0.8} />
            </Sequence>
          ))}

          {/* visual de la escena (despues del cartel narrado). historias (preset.stills): PNG estatico con
              Ken Burns que llena la ventana de la voz. Resto: clip de video en camara lenta.
              VOZ-CONTINUA: la imagen NO se dibuja aqui -> viene de la capa de crossfade en ViralVideo
              (escenas encimadas que se disuelven), para que NO se sienta el corte entre imagenes. */}
          {!continuous && (
            <Sequence from={cardFrames} durationInFrames={clipWindow}>
              {isEditorNarrativeCard(scene) ? (
                <NarrativeCard text={scene.card?.text} preset={preset} frames={clipWindow} props={props} />
              ) : preset.stills && isAnimatedScene(scene) ? (
                <EditorMotionFrame
                  motion={motionNameFor(props, scene, sceneIndex, true, preset)}
                  windowFrames={clipWindow}
                  pan={motionPanFor(props, scene, sceneIndex, true, 2)}
                  zoom={motionZoomFor(props, scene, sceneIndex, true, 1.02)}
                >
                  <SceneClip slug={slug} id={sceneId(scene)} />
                </EditorMotionFrame>
              ) : preset.stills ? (
                <KenBurnsImage
                  src={staticFile(`${slug}/images/${sceneId(scene)}.jpg`)}
                  motion={motionNameFor(props, scene, sceneIndex, false, preset)}
                  windowFrames={clipWindow}
                  pan={motionPanFor(props, scene, sceneIndex, false, props.project.ken_pan ?? (preset.stills ? HIST_PAN : undefined))}
                  zoom={motionZoomFor(props, scene, sceneIndex, false, props.project.ken_zoom ?? (preset.stills ? HIST_ZOOM : undefined))}
                />
              ) : (
                <AbsoluteFill style={{ transform: `scale(${CLIP_ZOOM})`, transformOrigin: "50% 0%" }}>
                  <OffthreadVideo
                    src={staticFile(`${slug}/clips/${sceneId(scene)}.mp4`)}
                    playbackRate={playbackRate}
                    volume={clipVol}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </AbsoluteFill>
              )}
            </Sequence>
          )}

          {/* karaoke sobre el contenido. preset.captions (historias): SI se dibuja (whisperx). criptoclaro/habitos: off (baked). */}
          {captionsEnabled(props, preset) && !isNarrativeCard(scene) && (
            <Karaoke
              text={sub.text}
              words={sub.words}
              windowFrames={contentFrames}
              voiceRate={voiceRate}
              preset={preset}
              hot={scene.captions?.highlight_words}
              bottom={capBottom}
              size={capSize}
            />
          )}

          {/* cartel narrado (DIA 1...) encima. historias: NO se dibuja (texto baked en la imagen). */}
          {!preset.stills && cardFrames > 0 && (
            <Sequence from={0} durationInFrames={cardFrames}>
              <LabelCard label={scene.time_label} preset={preset} />
            </Sequence>
          )}
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

// ---------- composicion principal ----------

export const ViralVideo: React.FC<ViralProps> = (props) => {
  const t = props._timeline!;
  const slug = getSlug(props);
  const preset = getPreset(props.project.preset);
  // Opening compartido: sus escenas leen medios de public/<assets_slug>/ (fallback: slug del proyecto).
  const openingSlug = props.opening?.assets_slug ?? slug;
  const openingIds = useMemo(
    () => new Set((props.opening?.scenes ?? []).map(sceneId)),
    [props.opening]
  );
  const byId = useMemo(
    () => Object.fromEntries([...(props.opening?.scenes ?? []), ...props.scenes].map((s) => [sceneId(s), s])),
    [props.opening, props.scenes]
  );

  // Colocacion: por defecto acumulativa (una escena tras otra). En voz-continua cada escena trae su
  // startFrame absoluto (su ventana sobre el audio maestro) -> se respeta para alinear imagen y voz.
  let from = t.hookFrames;
  const placed = t.scenes.map((st) => {
    const at = typeof st.startFrame === "number" ? st.startFrame : from;
    from = at + st.sceneFrames;
    return { st, at };
  });

  // historias voz-continua: imagenes con crossfade (disolvencia) en vez de corte duro entre escenas.
  const continuous = !!preset.stills && !!props.audio?._continuous && !!props.audio?._master;
  const xfadeFrames = Math.max(0, Math.round((props.project.crossfade_s ?? HIST_XFADE_S) * t.fps));

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {(() => {
        // Musica de fondo: la del proyecto si la trae; si no, la COMPARTIDA por defecto. Loop para cubrir
        // todo el video. Volumen FIJO 0.25 siempre (el usuario lo quiere asi); music_volume=0 sigue silenciando.
        const ownMusic = props.audio?.music_file;
        // novela-coreana E historias: SIN musica de fondo por defecto (no les queda; la voz manda). Solo suena
        // si el JSON trae su propio audio.music_file. Otros presets: musica compartida por defecto (intacto).
        const isNovela = props.project.preset === "novela-coreana";
        const noDefaultMusic = isNovela || preset.stills;
        const muted = props.audio?.music_volume === 0 || (noDefaultMusic && !ownMusic);
        if (muted && !ownMusic) return null; // nada de musica -> ni cargar el default
        const src = ownMusic ? staticFile(`${slug}/${ownMusic}`) : staticFile(DEFAULT_MUSIC);
        // historias respeta audio.music_volume del JSON (control por video) y por defecto va a HIST_MUSIC_VOL
        // (0.15, mas baja). Otros presets: FIJO 0.25 como antes.
        const vol = muted ? 0
          : preset.stills ? (typeof props.audio?.music_volume === "number" ? props.audio.music_volume : HIST_MUSIC_VOL)
          : DEFAULT_MUSIC_VOL;
        return <Audio src={src} volume={vol} loop />;
      })()}

      {/* historias voz-continua: UNA pista maestra de voz (full.mp3) para TODO el video -> sin costuras
          entre escenas. Las imagenes se colocan en su ventana (calculada de los timestamps de Fish). */}
      {preset.stills && props.audio?._continuous && props.audio?._master && (
        <Audio src={staticFile(`${slug}/${props.audio._master}`)} playbackRate={props.audio?.voice_rate ?? 1.0} />
      )}

      {/* CAPA DE IMAGENES (voz-continua): cada escena se DISUELVE en la siguiente. Su Sequence se solapa
          xfadeFrames con el final de la anterior y va ENCIMA con fade-in -> crossfade (sin corte duro).
          Va DEBAJO de los captions (que se renderizan despues y SIN solape -> nunca dos captions a la vez). */}
      {continuous && placed.map(({ st, at }, i) => {
        const scene = byId[st.id];
        if (!scene) return null;
        const isLast = i === placed.length - 1;
        const dur = st.sceneFrames + (isLast ? 0 : xfadeFrames);
        return (
          <Sequence key={`img-${st.id}`} from={at} durationInFrames={dur}>
            <FadeIn frames={xfadeFrames}>
              {isEditorNarrativeCard(scene) ? (
                <NarrativeCard text={scene.card?.text} preset={preset} frames={dur} props={props} />
              ) : isAnimatedScene(scene) ? (
                <EditorMotionFrame
                  motion={motionNameFor(props, scene, i, true, preset)}
                  windowFrames={dur}
                  pan={motionPanFor(props, scene, i, true, 2)}
                  zoom={motionZoomFor(props, scene, i, true, 1.02)}
                >
                  <SceneClip slug={slug} id={sceneId(scene)} />
                </EditorMotionFrame>
              ) : (
                <KenBurnsImage
                  src={staticFile(`${slug}/images/${sceneId(scene)}.jpg`)}
                  motion={motionNameFor(props, scene, i, false, preset)}
                  windowFrames={dur}
                  pan={motionPanFor(props, scene, i, false, props.project.ken_pan ?? HIST_PAN)}
                  zoom={motionZoomFor(props, scene, i, false, props.project.ken_zoom ?? HIST_ZOOM)}
                />
              )}
            </FadeIn>
          </Sequence>
        );
      })}

      {t.hookFrames > 0 && (
        <Sequence from={0} durationInFrames={t.hookFrames}>
          <Hook props={props} preset={preset} />
        </Sequence>
      )}

      {placed.map(({ st, at }, idx) => {
        const scene = byId[st.id];
        if (!scene) return null;
        return (
          <Sequence key={st.id} from={at} durationInFrames={st.sceneFrames}>
            <Scene
              props={props}
              scene={scene}
              timing={st}
              preset={preset}
              assetSlug={openingIds.has(st.id) ? openingSlug : slug}
              sceneIndex={idx}
              continuous={continuous}
            />
          </Sequence>
        );
      })}

      {/* pov-historias: fundido de negro -> imagen al arranque ("despertar"). Encima de todo (ultimo hijo).
          Gateado por preset.wakeIntro -> otros presets no lo montan. */}
      {preset.wakeIntro && <WakeIntroOverlay />}
    </AbsoluteFill>
  );
};
