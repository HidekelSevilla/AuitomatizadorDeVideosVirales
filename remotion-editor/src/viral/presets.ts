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
  // Historias (documental HORIZONTAL 16:9, arte de codice): stills + Ken Burns en el editor, SIN video.
  // Subtitulo lower-third blanco con palabra clave en ambar (look de codice/amate). El cartel time_label
  // (negro) sigue disponible como "capitulo" en las versiones largas (showLabelCard true, se dispara solo
  // si la voz narra el label, igual que esqueletos).
  historias: {
    captionBase: "#FFFFFF",
    captionHotBg: "#E8B84B", // ambar/oro de codice (color del texto resaltado, no de una caja)
    captionHotText: "#111111",
    showLabelCard: true,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
  },
};

export const DEFAULT_PRESET = "esqueletos";

export const getPreset = (name?: string): Preset =>
  (name && PRESETS[name]) || PRESETS[DEFAULT_PRESET];
