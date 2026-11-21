// Uploads a file from the browser to our own server (app/api/upload), which stores it
// on disk and returns { url, fileId, name, filePath, size }. XHR gives real upload
// progress for large files (hero videos).
export const UPLOAD_FOLDER = "/octabuilders";
// Chat attachments get their own folder: everything in it is deleted after 24 hours
// (purgeExpiredMessages in lib/messaging.js), so nothing else may be uploaded there.
export const CHAT_UPLOAD_FOLDER = "/octabuilders/chat";

export function uploadFile(file, { onProgress, folder = UPLOAD_FOLDER } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name || `upload-${Date.now()}`));
    xhr.setRequestHeader("X-Upload-Folder", folder);

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
        reject(new Error(xhr.status === 413 ? "file_too_large" : "upload_failed"));
      }
    };
    xhr.onerror = () => reject(new Error("network_error"));
    xhr.send(file);
  });
}
