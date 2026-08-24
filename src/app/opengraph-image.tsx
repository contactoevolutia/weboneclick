import { ImageResponse } from "next/og";

export const alt = "OneClick — Apple Premium Reseller Argentina";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #111 0%, #2a2a2a 100%)",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>OneClick</div>
        <div style={{ fontSize: 36, marginTop: 16, opacity: 0.9 }}>
          Apple Premium Reseller Argentina
        </div>
        <div style={{ fontSize: 24, marginTop: 28, opacity: 0.65 }}>
          iPhone · Mac · iPad · AirPods · Apple Watch
        </div>
      </div>
    ),
    { ...size }
  );
}
