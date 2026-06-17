import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  spring,
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
const CLIP_VOL = 0.1; // audio propio del clip animado (bajo)
const VOICE_RATE = 0.92; // voz un poco mas lenta (1 = normal)
const HOOK_SFX = "click.mp3"; // click en cada corte del hook
const HOOK_SFX_VOL = 1.0; // click del corte (no distorsionar el primer segundo, el mas critico)
const SCENE_SFX = "flash.mp3"; // flash al aparecer el cartel de cada escena (DIA 1...)
const SCENE_SFX_VOL = 1.25;
const CARD_SEC = 0.8;
const CLIP_ZOOM = 1.14; // recorta el borde inferior (anclado arriba) para quitar la marca de Flow

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

const NUMWORDS = new Set(
  "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte treinta cuarenta cincuenta".split(" ")
);
const isNumberWord = (w: string): boolean => NUMWORDS.has(norm(w)) || /^\d+$/.test(norm(w));

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
  const unit = norm(label.split(/\s+/)[0]);
  if (words && words.length) {
    let i = 0;
    if (norm(words[0].word) === unit) {
      i = 1;
      while (i < words.length && isNumberWord(words[i].word)) i++;
    }
    const sliced = words.slice(i);
    return { words: sliced, text: sliced.map((w) => w.word).join(" ") };
  }
  const toks = (text ?? "").trim().split(/\s+/).filter(Boolean);
  let i = 0;
  if (toks[0] && norm(toks[0]) === unit) {
    i = 1;
    while (i < toks.length && isNumberWord(toks[i])) i++;
  }
  return { words: undefined, text: toks.slice(i).join(" ") };
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
      : norm((text ?? "").trim().split(/\s+/)[0] ?? "");
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
    // cartel (pantalla negra) SOLO si la voz narra el time_label; las escenas internas no lo cortan.
    const cardFrames =
      baseCard > 0 && labelNarrated(sc?.voiceover?.words, sc?.voiceover?.text, sc?.time_label)
        ? baseCard
        : 0;
    let voiceSec = defClip;
    try {
      voiceSec = await getAudioDurationInSeconds(staticFile(`${slug}/voice/${id}.mp3`));
    } catch {
      voiceSec = defClip;
    }
    const effVoice = Math.max(1, Math.round((voiceSec / voiceRate) * fps));
    const sceneFrames = Math.max(effVoice, cardFrames + Math.round(0.4 * fps));
    const clipWindow = sceneFrames - cardFrames;
    const clipDur = byId[id]?.timeline?.clip_duration_s ?? defClip;
    const playbackRate = Math.max(0.5, Math.min(1, (clipDur * fps) / clipWindow));
    scenes.push({ id, cardFrames, sceneFrames, clipWindow, playbackRate });
  }

  const hookFrames = Math.round((props.hook?.duration_s ?? 0) * fps);
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
  const { fps } = useVideoConfig();

  const list = useMemo(() => {
    if (words && words.length) return words;
    const ws = (text ?? "").trim().split(/\s+/).filter(Boolean);
    return ws.map((w) => ({ word: w, start: -1, end: -1 })) as WordTs[];
  }, [text, words]);
  const hotSet = useMemo(
    () => new Set(hot.flatMap((h) => h.split(/\s+/)).map(norm).filter(Boolean)),
    [hot]
  );

  const timed = list.length > 0 && list[0].start >= 0;

  // Agrupa en FRASES (ventana karaoke de 3-5 palabras, estandar de retencion vs 1 palabra suelta):
  // por gap temporal >0.4s entre palabras (si hay timestamps) o por cuenta fija (fallback uniforme).
  const chunks = useMemo<WordTs[][]>(() => {
    const out: WordTs[][] = [];
    let cur: WordTs[] = [];
    for (let i = 0; i < list.length; i++) {
      cur.push(list[i]);
      const next = list[i + 1];
      const gap = timed && next ? next.start - list[i].end : 0;
      if (!next || cur.length >= 4 || (timed && gap > 0.4)) { out.push(cur); cur = []; }
    }
    return out;
  }, [list, timed]);

  if (list.length === 0) return null;

  // Palabra activa global (misma logica de sync que antes).
  let idx: number;
  let wordStartFrame: number;
  if (timed) {
    const audioT = (frame / fps) * voiceRate; // posicion real dentro del mp3 (esta ralentizado)
    idx = list.findIndex((w) => audioT >= w.start && audioT < w.end);
    if (idx < 0) idx = audioT < list[0].start ? 0 : list.length - 1;
    wordStartFrame = (list[idx].start / voiceRate) * fps;
  } else {
    const per = windowFrames / list.length;
    idx = Math.max(0, Math.min(list.length - 1, Math.floor(frame / per)));
    wordStartFrame = idx * per;
  }

  // Localiza el chunk activo y el offset de la palabra activa dentro de el.
  let acc = 0, chunkIdx = 0, wordInChunk = 0;
  for (let c = 0; c < chunks.length; c++) {
    if (idx < acc + chunks[c].length) { chunkIdx = c; wordInChunk = idx - acc; break; }
    acc += chunks[c].length;
  }
  const phrase = chunks[chunkIdx] ?? [];
  const pop = spring({ frame: frame - wordStartFrame, fps, config: { damping: 14, stiffness: 200, mass: 0.4 } });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: bottom }}>
      <div
        style={{
          display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end",
          gap: `${Math.round(size * 0.1)}px ${Math.round(size * 0.16)}px`,
          maxWidth: "90%", padding: "0 32px",
        }}
      >
        {phrase.map((pw, i) => {
          const active = i === wordInChunk;
          const word = cleanWord(pw.word);
          const isHot = hotSet.has(norm(word));
          const scale = active ? 0.74 + 0.26 * pop : 0.64;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `scale(${scale})`,
                transformOrigin: "center bottom",
                fontFamily, fontWeight: 900, fontSize: size, letterSpacing: -1, lineHeight: 1.02,
                textTransform: "uppercase",
                color: isHot ? preset.captionHotBg : preset.captionBase,
                opacity: active ? 1 : 0.58,
                WebkitTextStroke: `${Math.round(size * 0.075)}px #000`,
                paintOrder: "stroke fill",
                textShadow: "0 12px 26px rgba(0,0,0,.8), 0 3px 8px rgba(0,0,0,.95)",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
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
          fontSize: 150,
          letterSpacing: 6,
          color: preset.labelCardColor,
          textTransform: "uppercase",
        }}
      >
        {label ?? ""}
      </div>
    </AbsoluteFill>
  );
};

// ---------- hook: montage + click en cada corte + karaoke ----------

const Hook: React.FC<{ props: ViralProps; preset: Preset }> = ({ props, preset }) => {
  const t = props._timeline!;
  const slug = getSlug(props);
  const sources = props.hook?.montage_sources ?? [];
  const n = sources.length;
  const clipVol = props.audio?.clip_volume ?? CLIP_VOL;
  const voiceRate = props.audio?.voice_rate ?? VOICE_RATE;
  const hookSfx = props.audio?.hook_sfx ?? HOOK_SFX;
  const hookVol = props.audio?.hook_sfx_volume ?? HOOK_SFX_VOL;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {n > 0 &&
        (() => {
          const per = Math.floor(t.hookFrames / n);
          let from = 0;
          return sources.map((src, i) => {
            const dur = i === n - 1 ? t.hookFrames - per * (n - 1) : per;
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
              </Sequence>
            );
            from += dur;
            return seq;
          });
        })()}
      <Audio src={staticFile(`${slug}/voice/hook.mp3`)} />
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
  const { cardFrames, sceneFrames, clipWindow, playbackRate } = timing;
  const sub = stripLabelWords(
    dedupeWords(scene.voiceover?.words),
    scene.voiceover?.text ?? scene.captions?.text,
    scene.time_label
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* voz: arranca con la escena (suena durante el cartel -> sincroniza "DIA 1") */}
      <Audio src={staticFile(`${slug}/voice/${scene.id}.mp3`)} playbackRate={voiceRate} />
      {/* flash al aparecer el cartel de la escena (DIA 1, SEMANA 1...): solo si hay cartel */}
      {sceneSfx && cardFrames > 0 && <Audio src={staticFile(`sfx/${sceneSfx}`)} volume={sceneVol} />}
      {/* sfx puntuales (at_s relativo al inicio de la escena) */}
      {(scene.sfx ?? []).map((cue, i) => (
        <Sequence key={i} from={Math.round((cue.at_s ?? 0) * fps)}>
          <Audio src={staticFile(`sfx/${cue.file}`)} volume={cue.volume ?? 0.8} />
        </Sequence>
      ))}

      {/* clip animado (despues del cartel), en camara lenta si la voz dura mas */}
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

      {/* karaoke sobre toda la escena (lo del cartel queda tapado por el cartel) */}
      <Karaoke
        text={sub.text}
        words={sub.words}
        windowFrames={sceneFrames}
        voiceRate={voiceRate}
        preset={preset}
        hot={scene.captions?.highlight_words}
        bottom={380}
        size={128}
      />

      {/* cartel "DIA 1" encima, primeros frames */}
      {cardFrames > 0 && (
        <Sequence from={0} durationInFrames={cardFrames}>
          <LabelCard label={scene.time_label} preset={preset} />
        </Sequence>
      )}
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
      {props.audio?.music_file && (
        <Audio
          src={staticFile(`${slug}/${props.audio.music_file}`)}
          volume={props.audio.music_volume ?? 0.18}
        />
      )}

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
