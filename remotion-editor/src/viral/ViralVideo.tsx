import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  spring,
  interpolate,
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

export const calcViralMetadata: CalculateMetadataFunction<ViralProps> = async ({ props }) => {
  const fps = props.project.fps ?? 24;
  const [width, height] = dimsFromAspect(props.project.aspect_ratio ?? "9:16");
  const slug = getSlug(props);
  const preset = getPreset(props.project.preset);
  const baseCard = preset.showLabelCard
    ? Math.round((props.capcut_export?.label_card_duration_s ?? CARD_SEC) * fps)
    : 0;
  const voiceRate = props.audio?.voice_rate ?? VOICE_RATE;
  const defClip = props.project.default_clip_duration_s ?? 4;
  const order = props.capcut_export?.clip_order ?? props.scenes.map((s) => s.id);
  const byId = Object.fromEntries(props.scenes.map((s) => [s.id, s]));

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
        const introSec = await getAudioDurationInSeconds(staticFile(`${slug}/voice/${sc.intro_card_voice}`));
        if (introSec > 0) introFrames = Math.round((introSec / voiceRate + 0.3) * fps);
      } catch { /* sin voz: usa baseCard (silencioso) */ }
    }
    let voiceSec = defClip;
    try {
      voiceSec = await getAudioDurationInSeconds(staticFile(`${slug}/voice/${id}.mp3`));
    } catch {
      voiceSec = defClip;
    }
    const effVoice = Math.max(1, Math.round((voiceSec / voiceRate) * fps));
    const contentFrames = Math.max(effVoice, cardFrames + Math.round(0.4 * fps));
    const sceneFrames = introFrames + contentFrames;
    const clipWindow = contentFrames - cardFrames;
    const clipDur = byId[id]?.timeline?.clip_duration_s ?? defClip;
    const playbackRate = Math.max(0.5, Math.min(1, (clipDur * fps) / clipWindow));
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
      // En un HUECO entre palabras (pausa) o fuera de rango: mostrar la ULTIMA palabra que YA empezo.
      // BUG anterior: saltaba a la palabra FINAL de la escena -> la resaltada (amarilla) aparecia ANTES
      // de tiempo en cada pausa. Ahora se queda en la palabra mas reciente -> sincronizado.
      idx = 0;
      for (let i = 0; i < list.length; i++) { if (list[i].start <= audioT) idx = i; else break; }
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

// ---------- destello blanco rapido (sincronizado con el flash de cada corte del hook) ----------

const FlashOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 5], [0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (op <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: "white", opacity: op }} />;
};

// ---------- hook: montage + flash en cada corte + karaoke ----------

const Hook: React.FC<{ props: ViralProps; preset: Preset }> = ({ props, preset }) => {
  const t = props._timeline!;
  const slug = getSlug(props);
  // Montage del hook: flashes CORTOS (~HOOK_CUT_S c/u); se meten TANTOS como haga falta para llenar la voz
  // del hook -> NO se estiran los pedazos, se agregan mas escenas. Pool: primero las montage_sources
  // curadas, luego el resto de escenas (clip_order) para variedad; si faltan, cicla.
  const curated = props.hook?.montage_sources ?? [];
  const order = props.capcut_export?.clip_order ?? props.scenes.map((s) => s.id);
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
  const voiceRate = props.audio?.voice_rate ?? VOICE_RATE;
  const hookSfx = props.audio?.hook_sfx ?? HOOK_SFX;
  const hookVol = props.audio?.hook_sfx_volume ?? HOOK_SFX_VOL;

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
                <AbsoluteFill style={{ transform: `scale(${CLIP_ZOOM})`, transformOrigin: "50% 0%" }}>
                  <OffthreadVideo
                    src={staticFile(`${slug}/clips/${src.scene_id}.mp4`)}
                    startFrom={Math.round(src.clip_in_s * t.fps)}
                    volume={clipVol}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </AbsoluteFill>
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
      <Karaoke
        text={props.hook?.voiceover}
        words={dedupeWords(props.hook?.words)}
        windowFrames={t.hookFrames}
        voiceRate={voiceRate}
        preset={preset}
        bottom={360}
        size={120}
      />
    </AbsoluteFill>
  );
};

// ---------- escena ----------

const Scene: React.FC<{
  props: ViralProps;
  scene: SceneData;
  timing: ComputedTimeline["scenes"][number];
  preset: Preset;
}> = ({ props, scene, timing, preset }) => {
  const { fps } = useVideoConfig();
  const slug = getSlug(props);
  const clipVol = props.audio?.clip_volume ?? CLIP_VOL;
  const voiceRate = props.audio?.voice_rate ?? VOICE_RATE;
  const sceneSfx = props.audio?.scene_sfx ?? SCENE_SFX;
  const sceneVol = props.audio?.scene_sfx_volume ?? SCENE_SFX_VOL;
  const { cardFrames, sceneFrames, clipWindow, playbackRate, introFrames } = timing;
  const contentFrames = sceneFrames - introFrames;
  const sub = stripLabelWords(
    dedupeWords(scene.voiceover?.words),
    stripTags(scene.voiceover?.text ?? scene.captions?.text),
    scene.time_label
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* cartel intro OPCIONAL (silencioso) ANTES del contenido, con flash. Solo si scene.intro_card. */}
      {introFrames > 0 && (
        <Sequence from={0} durationInFrames={introFrames}>
          {sceneSfx && <Audio src={staticFile(`sfx/${sceneSfx}`)} volume={sceneVol} />}
          {scene.intro_card_voice && (
            <Audio src={staticFile(`${slug}/voice/${scene.intro_card_voice}`)} playbackRate={voiceRate} />
          )}
          <LabelCard label={scene.intro_card} preset={preset} />
        </Sequence>
      )}

      {/* contenido de la escena, desplazado por el cartel intro (introFrames=0 => sin desplazar) */}
      <Sequence from={introFrames} durationInFrames={contentFrames}>
        <AbsoluteFill style={{ backgroundColor: "black" }}>
          {/* voz: arranca con el contenido (suena durante el cartel narrado -> sincroniza "DIA 1") */}
          <Audio src={staticFile(`${slug}/voice/${scene.id}.mp3`)} playbackRate={voiceRate} />
          {/* flash al aparecer el cartel narrado de la escena */}
          {sceneSfx && cardFrames > 0 && <Audio src={staticFile(`sfx/${sceneSfx}`)} volume={sceneVol} />}
          {/* sfx puntuales (at_s relativo al inicio del contenido) */}
          {(scene.sfx ?? []).map((cue, i) => (
            <Sequence key={i} from={Math.round((cue.at_s ?? 0) * fps)}>
              <Audio src={staticFile(`sfx/${cue.file}`)} volume={cue.volume ?? 0.8} />
            </Sequence>
          ))}

          {/* clip animado (despues del cartel narrado), en camara lenta si la voz dura mas */}
          <Sequence from={cardFrames} durationInFrames={clipWindow}>
            <AbsoluteFill style={{ transform: `scale(${CLIP_ZOOM})`, transformOrigin: "50% 0%" }}>
              <OffthreadVideo
                src={staticFile(`${slug}/clips/${scene.id}.mp4`)}
                playbackRate={playbackRate}
                volume={clipVol}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </AbsoluteFill>
          </Sequence>

          {/* karaoke sobre el contenido (lo del cartel narrado queda tapado por el cartel) */}
          <Karaoke
            text={sub.text}
            words={sub.words}
            windowFrames={contentFrames}
            voiceRate={voiceRate}
            preset={preset}
            hot={scene.captions?.highlight_words}
            bottom={380}
            size={128}
          />

          {/* cartel narrado (DIA 1...) encima, primeros frames del contenido */}
          {cardFrames > 0 && (
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
  const byId = useMemo(
    () => Object.fromEntries(props.scenes.map((s) => [s.id, s])),
    [props.scenes]
  );

  let from = t.hookFrames;
  const placed = t.scenes.map((st) => {
    const at = from;
    from += st.sceneFrames;
    return { st, at };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {(() => {
        // Musica de fondo: la del proyecto si la trae; si no, la COMPARTIDA por defecto. Loop para cubrir
        // todo el video. Volumen FIJO 0.25 siempre (el usuario lo quiere asi); music_volume=0 sigue silenciando.
        const ownMusic = props.audio?.music_file;
        const src = ownMusic ? staticFile(`${slug}/${ownMusic}`) : staticFile(DEFAULT_MUSIC);
        const vol = props.audio?.music_volume === 0 ? 0 : DEFAULT_MUSIC_VOL;
        return <Audio src={src} volume={vol} loop />;
      })()}

      {t.hookFrames > 0 && (
        <Sequence from={0} durationInFrames={t.hookFrames}>
          <Hook props={props} preset={preset} />
        </Sequence>
      )}

      {placed.map(({ st, at }) => {
        const scene = byId[st.id];
        if (!scene) return null;
        return (
          <Sequence key={st.id} from={at} durationInFrames={st.sceneFrames}>
            <Scene props={props} scene={scene} timing={st} preset={preset} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
