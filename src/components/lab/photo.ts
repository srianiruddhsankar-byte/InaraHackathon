// Browser-only helpers for photo uploads: run OCR (tesseract.js, in the
// browser) and make a small JPEG thumbnail. The full photo is never stored.
import type { OcrLine } from "@/lib/ocr";

export interface OcrProgress {
  status: string;
  /** 0–1 */
  progress: number;
}

const STATUS_TEXT: Record<string, string> = {
  "loading tesseract core": "Loading OCR engine…",
  "initializing tesseract": "Starting OCR…",
  "loading language traineddata": "Loading English text model…",
  "initializing api": "Starting OCR…",
  "recognizing text": "Reading text…",
};

/** Read text lines (with confidence) from an image. tesseract.js is loaded only when needed. */
export async function runOcr(image: Blob, onProgress: (p: OcrProgress) => void): Promise<OcrLine[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m) => onProgress({ status: STATUS_TEXT[m.status] ?? "Working…", progress: m.progress ?? 0 }),
  });
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true, text: true });
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    if (lines.length > 0) return lines.map((l) => ({ text: l.text.trim(), confidence: l.confidence }));
    return data.text.split(/\r?\n/).map((text) => ({ text, confidence: data.confidence }));
  } finally {
    await worker.terminate();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image"));
    img.src = src;
  });
}

/** A small JPEG data URL (max 320 px wide, ~10–30 KB) — safe to keep in localStorage. */
export async function makeThumbnail(src: string, maxWidth = 320, quality = 0.6): Promise<string | undefined> {
  try {
    const img = await loadImage(src);
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return undefined;
  }
}
