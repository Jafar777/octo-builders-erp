// Uploads a file straight from the browser to ImageKit using a short-lived
// signature from our server, so large files (hero videos) skip our server
// entirely and we get real upload progress via XHR.
export function uploadFileToImageKit(file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    fetch("/api/upload-auth")
      .then((res) => {
        if (!res.ok) throw new Error("auth_failed");
        return res.json();
      })
      .then((auth) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileName", file.name || `upload-${Date.now()}`);
        formData.append("publicKey", auth.publicKey);
        formData.append("signature", auth.signature);
        formData.append("expire", auth.expire);
        formData.append("token", auth.token);
        formData.append("folder", "/octabuilders");
        formData.append("useUniqueFileName", "true");

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "https://upload.imagekit.io/api/v1/files/upload");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("parse_failed"));
            }
          } else {
            reject(new Error("upload_failed"));
          }
        };
        xhr.onerror = () => reject(new Error("network_error"));
        xhr.send(formData);
      })
      .catch(reject);
  });
}
