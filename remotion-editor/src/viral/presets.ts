// Presets de estilo. El JSON solo manda el nombre (project.preset);
// el look vive aqui. Para un look nuevo, agrega una entrada y listo.

export interface Preset {
  captionBase: string; // color del texto normal del subtitulo
  captionHotBg: string; // fondo de la caja de la palabra clave
  captionHotText: string; // color del texto de la palabra clave
  showLabelCard: boolean; // mostrar el cartel "DIA 1" antes de cada escena
  labelCardBg: string; // fondo del cartel
  labelCardColor: string; // color del texto del cartel
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
};

export const DEFAULT_PRESET = "esqueletos";

export const getPreset = (name?: string): Preset =>
  (name && PRESETS[name]) || PRESETS[DEFAULT_PRESET];
