import { ImageResponse } from "next/og";

import { Monogram } from "@/app/_components/monogram";

/**
 * App icons, generated at build time so no binary assets live in the repo.
 * Served at /icon/192 and /icon/512 (referenced by app/manifest.ts) and
 * linked as the favicon.
 */
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id);
  return new ImageResponse(<Monogram size={size} />, { width: size, height: size });
}
