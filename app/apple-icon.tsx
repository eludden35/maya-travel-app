import { ImageResponse } from "next/og";

import { Monogram } from "@/app/_components/monogram";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<Monogram size={size.width} />, size);
}
