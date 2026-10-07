"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";

// The browser's built-in QR reader (Chrome, Edge, Android). Not in the TS DOM types yet.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function detectorClass(): BarcodeDetectorCtor | null {
  return typeof window !== "undefined" && "BarcodeDetector" in window
    ? (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector
    : null;
}

type Status = "starting" | "scanning" | "unsupported" | "denied";

/**
 * Scans a QR code with the laptop / phone camera. If the browser can't read QR codes
 * or there is no camera (or permission is refused), it says so — the doctor types the code instead.
 */
export function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const Detector = detectorClass();
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function start() {
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        if (!stopped) setStatus("denied");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setStatus("scanning");
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (stopped) return;
        try {
          const [hit] = await detector.detect(video);
          if (hit?.rawValue) {
            onCodeRef.current(hit.rawValue);
            return;
          }
        } catch {
          // A frame that isn't ready yet — try the next one.
        }
        timer = setTimeout(tick, 250);
      };
      void tick();
    }
    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (status === "unsupported" || status === "denied") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        <CameraOff className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
        <p>
          {status === "denied"
            ? "No camera, or camera permission was refused."
            : "This browser can't scan QR codes (try Chrome or Edge)."}{" "}
          Type the code shown under the patient&apos;s QR below.
        </p>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-900">
      <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline aria-label="Camera view for scanning the QR code" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-48 rounded-2xl border-2 border-white/80" />
      </div>
      {status === "starting" && (
        <p className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-sm text-white">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Starting camera…
        </p>
      )}
      {status === "scanning" && <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">Point the camera at the patient&apos;s QR code</p>}
    </div>
  );
}
