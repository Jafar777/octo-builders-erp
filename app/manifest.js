// "Add to home screen": the ERP opens full screen like an app, straight to the dashboard.
export default function manifest() {
  return {
    name: "Octo Builders ERP",
    short_name: "Octo ERP",
    description: "Octo Builders — company workspace",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    background_color: "#0f2331",
    theme_color: "#0f2331",
    icons: [
      { src: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/app-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
