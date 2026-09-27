import { downloadBlob } from "./shared";

// Realtime capture via the browser's native MediaRecorder — no encoder
// dependency. Records exactly as the canvas renders for `videoDuration`
// seconds, so it's not frame-accurate like the PNG export, but it's instant.
// Only needs videoDuration, so it works for both v1 (ParticleConfig) and v2
// (GraphConfig) without depending on either type.
export function exportVideo(canvas: HTMLCanvasElement, cfg: { videoDuration: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(60);
    let mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      downloadBlob(blob, `particle-video-${Date.now()}.webm`);
      resolve();
    };
    recorder.onerror = (e) => reject(e);
    recorder.start();
    setTimeout(() => recorder.stop(), cfg.videoDuration * 1000);
  });
}
