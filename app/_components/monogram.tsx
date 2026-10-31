/**
 * The JTSN monogram on Ember, rendered by `next/og` for the app icons
 * (app/icon.tsx, app/apple-icon.tsx). Placeholder until the visual identity
 * work lands a drawn mark. Inline styles only: Satori has no Tailwind.
 */
export function Monogram({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#d9531e",
        color: "#1a1714",
        fontSize: size * 0.3,
        fontWeight: 700,
        letterSpacing: -size * 0.01,
      }}
    >
      JTSN
    </div>
  );
}
