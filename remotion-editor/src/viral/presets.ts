// Presets de estilo. El JSON solo manda el nombre (project.preset);
// el look vive aqui. Para un look nuevo, agrega una entrada y listo.

export interface Preset {
  captionBase: string; // color del texto normal del subtitulo
  captionHotBg: string; // fondo de la caja de la palabra clave
  captionHotText: string; // color del texto de la palabra clave
  showLabelCard: boolean; // mostrar el cartel "DIA 1" antes de cada escena
  labelCardBg: string; // fondo del cartel
  labelCardColor: string; // color del texto del cartel
  stills?: boolean; // image-only: PNG estatico + Ken Burns en el editor (preset historias). Sin video.
  captions?: boolean; // dibujar el karaoke desde Remotion AUNQUE sea stills. Si falta/false, no hay subtitulos.
  captionMinWords?: number; // minimo de palabras por bloque karaoke (salvo remanente inevitable)
  captionMaxWords?: number; // maximo de palabras por bloque karaoke
  wakeIntro?: boolean; // pov-historias: fundido de negro a la primera imagen al ARRANQUE del video (efecto "despertar").
                       // Ausente/false en todos los demas presets -> sin efecto (cero impacto).
  narrativeCardFont?: string;
}

export const PRESETS: Record<string, Preset> = {
  esqueletos: {
    captionBase: "#ffffff",
    captionHotBg: "#ffd400",
    captionHotText: "#111111",
    showLabelCard: true,
    labelCardBg: "#000000",
    labelCardColor: "#ffffff",
  },
  frutinovelas: {
    captionBase: "#ffffff",
    captionHotBg: "#ff3b8d",
    captionHotText: "#ffffff",
    showLabelCard: false,
    labelCardBg: "#1a0014",
    labelCardColor: "#ff3b8d",
  },
  // Novela coreana (melodrama vertical): subtitulo blanco limpio, palabra clave en dorado, SIN cartel negro.
  // OJO: el render NO dibuja caja; colorea la palabra hot con captionHotBg. Por eso el dorado va en
  // captionHotBg (no "transparent", que la dejaria invisible). captionHotText no lo usa el render actual.
  "novela-coreana": {
    captionBase: "#FFFFFF",
    captionHotBg: "#F4C26B", // palabra resaltada en dorado suave (color del texto, no de una caja)
    captionHotText: "#F4C26B",
    showLabelCard: false, // sin carteles negros en este preset
    labelCardBg: "#0A0A0A",
    labelCardColor: "#FFFFFF",
  },
  // Mismo formato de novela coreana, para guiones/voz en ingles. La unica diferencia editorial
  // es que los subtitulos se muestran como frases estables de 3 a 4 palabras.
  "novelas-coreanas-eng": {
    captionBase: "#FFFFFF",
    captionHotBg: "#F4C26B",
    captionHotText: "#F4C26B",
    showLabelCard: false,
    labelCardBg: "#0A0A0A",
    labelCardColor: "#FFFFFF",
    captionMinWords: 3,
    captionMaxWords: 4,
  },
  // Historias (documental HORIZONTAL 16:9, arte de codice): stills + Ken Burns en el editor, SIN subtitulos.
  historias: {
    captionBase: "#FFFFFF",
    captionHotBg: "#E8B84B", // ambar/oro de codice (color del texto resaltado, no de una caja)
    captionHotText: "#111111",
    showLabelCard: true,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
    captions: false,
  },
  // Reel/Short VERTICAL 9:16 que promociona el video largo del canal. MISMO look que historias (image-only
  // stills, Ken Burns opt-in). Solo cambia la orientacion, que la da project.aspect_ratio del JSON (9:16).
  // El resto del pipeline trata cualquier preset "historias*" igual (V3/V2, voz continua, whisper, etc.).
  historias_reel: {
    captionBase: "#FFFFFF",
    captionHotBg: "#E8B84B",
    captionHotText: "#111111",
    showLabelCard: true,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
    captions: false,
  },
  // Cripto-Claro (explainer faceless de finanzas/cripto, estilo B pizarron limpio): CLON de historias.
  // Image-only stills + Ken Burns; el render NO pone texto (todo horneado por la IA). criptoclaro = 16:9
  // largo, criptoclaro_reel = 9:16 Short. El pipeline trata "criptoclaro*" igual que "historias*" (imageOnly,
  // voz continua ElevenLabs, whisper, etc.). Caption/labelCard no se usan (preset.stills los oculta).
  criptoclaro: {
    captionBase: "#FFFFFF",
    captionHotBg: "#E8B84B",
    captionHotText: "#111111",
    showLabelCard: true,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
  },
  criptoclaro_reel: {
    captionBase: "#FFFFFF",
    captionHotBg: "#E8B84B",
    captionHotText: "#111111",
    showLabelCard: true,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
  },
  // Habitos & Finanzas (storytelling line-art calmado, personaje recurrente): HIBRIDO como criptoclaro_reel.
  // stills:true -> escenas static = still + Ken Burns, escenas render_mode:"animated" = clip de Grok (SceneClip).
  // Voz continua ElevenLabs (full_script). Texto on-screen HORNEADO en la imagen por Grok (el render no dibuja
  // texto cuando stills:true). 9:16 (vertical_short) o 16:9 (horizontal_long) los da project.aspect_ratio.
  habitos_finanzas: {
    captionBase: "#FFFFFF",
    captionHotBg: "#E8B84B",
    captionHotText: "#111111",
    showLabelCard: true,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
  },
  // POV-Historias (reels POV historicos, fotorrealista, primera persona): CLON de habitos_finanzas pero
  // TODAS las escenas son video (render_mode:"animated" en el 100%). SIN texto horneado ni carteles ->
  // subtitulos karaoke dibujados por Remotion (captions:true). Voz continua ElevenLabs
  // (full_script). 9:16 o 16:9 lo da project.aspect_ratio. wakeIntro:true -> fundido de negro al inicio.
  "pov-historias": {
    captionBase: "#FFFFFF",
    captionHotBg: "#E8B84B",
    captionHotText: "#111111",
    showLabelCard: false,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
    captions: true,
    wakeIntro: true,
  },
  manhwa: {
    captionBase: "#FFFFFF",
    captionHotBg: "#E63946",
    captionHotText: "#FFFFFF",
    showLabelCard: false,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
    captions: true,
    narrativeCardFont: '"Comic Sans MS", "Segoe Print", "Comic Neue", "Trebuchet MS", sans-serif',
  },
};

export const DEFAULT_PRESET = "esqueletos";

export const getPreset = (name?: string): Preset =>
  (name && PRESETS[name]) || PRESETS[DEFAULT_PRESET];
