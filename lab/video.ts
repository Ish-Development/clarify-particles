// A video file from frames drawn one at a time: each one is encoded with its
// own timestamp (WebCodecs, H.264 in MP4), so the video plays at a steady 60
// fps however long a frame took to draw, and the export runs as fast as the
// frames come (no waiting in real time).
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from "mediabunny";

// a video's size: the frame fitted in the box (turned to the frame's way)
export const VIDEO_SIZES = { "4K": [3840, 2160], "2K": [2560, 1440], HD: [1920, 1080] } as const;
export type VideoSize = keyof typeof VIDEO_SIZES;
export function videoScale(w: number, h: number, size: VideoSize) {
  const [a, b] = VIDEO_SIZES[size] ?? VIDEO_SIZES["4K"];
  const [bw, bh] = w >= h ? [a, b] : [b, a];
  return Math.min(bw / w, bh / h);
}

// frames: how many; draw(i): frame i onto c; progress(done 0..1, s left);
// stopped(): true to give up (then null)
export async function encodeVideo(
  c: HTMLCanvasElement,
  frames: number,
  fps: number,
  draw: (i: number) => Promise<unknown> | unknown,
  progress: (p: number, secondsLeft: number) => void,
  stopped: () => boolean,
): Promise<Blob | null> {
  if (!(await canEncodeVideo("avc", { width: c.width, height: c.height }))) throw new Error(`this browser can't encode ${c.width} × ${c.height} H.264`);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  // fine dots and hairlines need the bits: about 40 Mbps at 4K, scaled by area
  const bitrate = Math.max(10_000_000, Math.round((40_000_000 * c.width * c.height) / (3840 * 2160)));
  const source = new CanvasSource(c, { codec: "avc", bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (stopped()) {
      await output.cancel();
      return null;
    }
    await draw(i);
    await source.add(i / fps, 1 / fps);
    // now and then, a breath for the page to show the progress
    if (i % 10 === 0) {
      const spent = (performance.now() - t0) / 1000;
      progress(i / frames, i ? (spent / i) * (frames - i) : frames / fps);
      await new Promise((r) => setTimeout(r));
    }
  }
  await output.finalize();
  return new Blob([(output.target as BufferTarget).buffer!], { type: "video/mp4" });
}
