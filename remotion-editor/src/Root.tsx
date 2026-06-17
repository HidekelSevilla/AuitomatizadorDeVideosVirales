import { Composition } from "remotion";
import { SmokeTest } from "./SmokeTest";
import { VideoEdit, videoEditSchema } from "./VideoEdit";
import { ViralVideo, calcViralMetadata } from "./viral/ViralVideo";
import type { ViralProps } from "./viral/types";

// Default minimo y autocontenido para Studio. Los renders reales pasan --props.
// Asi el job NUNCA hereda audio/escenas de un default ajeno (evita 404 de medios).
const viralDefaults: ViralProps = {
  project: { title: "Demo", slug: "test", preset: "esqueletos", aspect_ratio: "9:16", fps: 24 },
  scenes: [{ id: "scene_01", time_label: "Demo", captions: { text: "Demo", highlight_words: [] } }],
  capcut_export: { clip_order: ["scene_01"], label_card_duration_s: 0.6 },
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Composicion de prueba: no necesita archivos externos. */}
      <Composition
        id="SmokeTest"
        component={SmokeTest}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* Plantilla simple: 1 video + titulo. */}
      <Composition
        id="VideoEdit"
        component={VideoEdit}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        schema={videoEditSchema}
        defaultProps={{ src: "ejemplo.mp4", titulo: "Texto sobre el video" }}
      />

      {/* Motor viral: lee el JSON maestro completo.
          Duracion total y de cada escena se calculan desde la voz (calculateMetadata).
          Para renderizar otro proyecto: npx remotion render ViralVideo out/x.mp4 --props=./data/otro.json */}
      <Composition
        id="ViralVideo"
        component={ViralVideo}
        durationInFrames={600}
        fps={24}
        width={1080}
        height={1920}
        defaultProps={viralDefaults}
        calculateMetadata={calcViralMetadata}
      />
    </>
  );
};
