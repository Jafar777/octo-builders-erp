import ImageKit from "imagekit";

let imagekit;

export function getImageKit() {
  if (!imagekit) {
    imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });
  }
  return imagekit;
}

// Short-lived signature the browser uses to upload straight to ImageKit,
// so large files (e.g. hero videos) never have to pass through our server.
export function getUploadAuthParams() {
  return getImageKit().getAuthenticationParameters();
}
