import type { MetadataRoute } from "next";

/**
 * Lets testers add Jettison to their home screen. The icon artwork is the
 * JTSN secondary mark (AGENTS.md: favicon, app shortcut, social avatar);
 * the label stays the full name.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jettison",
    short_name: "Jettison",
    description:
      "Plan trips with the people you actually know, and split the money so no one fronts the bill.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
