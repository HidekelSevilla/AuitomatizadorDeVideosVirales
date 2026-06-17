import { AbsoluteFill, OffthreadVideo, staticFile, interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";

export const videoEditSchema = z.object({
  // Ruta relativa dentro de /public, ej: "clip1.mp4"
  src: z.string(),
  titulo: z.string(),
});

// Plantilla base para editar un video real:
// - Reproduce el video de fondo (OffthreadVideo = mejor para render).
// - Sobrepone un titulo con fade-in.
// Esto es solo un punto de partida; lo adaptamos a tu estilo cuando me pases los clips.
export const VideoEdit: React.FC<z.infer<typeof videoEditSchema>> = ({ src, titulo }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <OffthreadVideo src={staticFile(src)} />
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 180,
        }}
      >
        <div
          style={{
            opacity,
            fontSize: 72,
            fontWeight: 900,
            color: "white",
            textAlign: "center",
            textShadow: "0 4px 24px rgba(0,0,0,0.8)",
            fontFamily: "Arial, sans-serif",
            padding: "0 60px",
          }}
        >
          {titulo}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
