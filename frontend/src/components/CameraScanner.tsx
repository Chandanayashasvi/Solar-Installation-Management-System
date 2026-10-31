import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Btn } from "../ui";

type Barcode = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<Barcode[]> };
type BarcodeDetectorConstructor = {
  new (options?: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats: () => Promise<string[]>;
};

export default function CameraScanner({ onScan }: { onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  const stop = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const start = async () => {
    setError("");
    const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector) {
      setError("Camera scanning is not supported in this browser. Enter the serial number manually.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is unavailable. Use a secure browser connection or enter the serial number manually.");
      return;
    }
    try {
      const supported = await Detector.getSupportedFormats();
      const formats = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "data_matrix", "pdf417", "aztec"].filter((format) => supported.includes(format));
      if (!formats.length) {
        setError("This browser cannot read supported barcode formats. Enter the serial number manually.");
        return;
      }
      const detector = new Detector({ formats });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw new Error("Camera preview could not be opened.");
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setActive(true);

      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const [result] = await detector.detect(videoRef.current);
            if (result?.rawValue.trim()) {
              const value = result.rawValue.trim();
              stop();
              onScan(value);
              return;
            }
          }
          frameRef.current = requestAnimationFrame(() => { void scan(); });
        } catch (scanError) {
          setError(scanError instanceof Error ? `Could not read the code: ${scanError.message}` : "Could not read the code.");
          stop();
        }
      };
      frameRef.current = requestAnimationFrame(() => { void scan(); });
    } catch (startError) {
      stop();
      setError(startError instanceof Error ? `Unable to access the camera: ${startError.message}` : "Unable to access the camera.");
    }
  };

  return <div className="mt-1">
    {active ? <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <video ref={videoRef} className="max-h-56 w-full rounded-lg bg-black object-cover" muted playsInline />
      <div className="flex items-center justify-between gap-2 text-xs text-slate-600"><span>Point the camera at a serial barcode or QR code.</span><Btn type="button" kind="ghost" onClick={stop}><CameraOff size={14} className="mr-1 inline" />Stop camera</Btn></div>
    </div> : <Btn type="button" kind="ghost" onClick={() => void start()}><Camera size={14} className="mr-1 inline" />Scan with camera</Btn>}
    {error && <p role="alert" className="mt-1 text-xs text-amber-800">{error}</p>}
  </div>;
}
