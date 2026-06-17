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
};

export const DEFAULT_PRESET = "esqueletos";

export const getPreset = (name?: string): Preset =>
  (name && PRESETS[name]) || PRESETS[DEFAULT_PRESET];
