import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";

// Composicion minima para verificar que el render funciona end-to-end.
export const SmokeTest: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #6d28d9 0%, #db2777 100%)",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ transform: `scale(${scale})`, opacity, textAlign: "center" }}>
        <div style={{ fontSize: 120, fontWeight: 900, color: "white" }}>OK</div>
        <div style={{ fontSize: 48, color: "white", marginTop: 20 }}>Remotion funciona</div>
      </div>
    </AbsoluteFill>
  );
};
