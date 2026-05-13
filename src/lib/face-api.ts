// Lazy-loaded face-api.js wrapper. Loads from CDN to avoid bundling heavy WASM.
let loadPromise: Promise<any> | null = null;

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

declare global {
  interface Window {
    faceapi: any;
  }
}

export async function loadFaceApi(): Promise<any> {
  if (typeof window === "undefined") throw new Error("face-api requires browser");
  if (window.faceapi && (window as any).__faceapi_loaded) return window.faceapi;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (!window.faceapi) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load face-api.js"));
        document.head.appendChild(s);
      });
    }
    const faceapi = window.faceapi;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    (window as any).__faceapi_loaded = true;
    return faceapi;
  })();
  return loadPromise;
}

export async function getDescriptorFromImage(img: HTMLImageElement): Promise<Float32Array | null> {
  const faceapi = await loadFaceApi();
  const result = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result?.descriptor ?? null;
}

export async function getDescriptorFromVideo(video: HTMLVideoElement): Promise<Float32Array | null> {
  const faceapi = await loadFaceApi();
  const result = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result?.descriptor ?? null;
}

export function euclideanDistance(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    sum += d * d;
  }
  return Math.sqrt(sum);
}
