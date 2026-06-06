// Extract a thumbnail JPEG from a video File by seeking to ~1s and snapping a frame.
export async function extractVideoThumbnail(file: File, seekTo = 5): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.src = url;

      const cleanup = () => URL.revokeObjectURL(url);

      const onError = () => { cleanup(); resolve(null); };
      video.addEventListener("error", onError);

      video.addEventListener("loadedmetadata", () => {
        const dur = video.duration || seekTo;
        const t = Math.min(Math.max(seekTo, 0.1), Math.max(0.1, dur - 0.1));
        try { video.currentTime = t; } catch { onError(); }
      });

      video.addEventListener("seeked", () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) { onError(); return; }
          const maxW = 720;
          const scale = Math.min(1, maxW / w);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) { onError(); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            cleanup();
            if (!blob) return resolve(null);
            resolve(new File([blob], "thumbnail.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.85);
        } catch { onError(); }
      });
    } catch {
      resolve(null);
    }
  });
}
