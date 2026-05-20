// Lazy-loaded face-api.js wrapper. Loads from CDN to avoid bundling heavy WASM.
let loadPromise: Promise<any> | null = null;

// Multiple model mirrors — the primary GitHub Pages host has had intermittent outages.
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
  "https://justadudewhohacks.github.io/face-api.js/models",
];

const SCRIPT_URLS = [
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js",
  "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js",
];

declare global {
  interface Window {
    faceapi: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function loadModelsWithFallback(faceapi: any): Promise<void> {
  let lastErr: unknown = null;
  for (const url of MODEL_URLS) {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`face-api: model load failed from ${url}, trying next mirror`, e);
    }
  }
  throw lastErr ?? new Error("All face-api model mirrors failed");
}

export async function loadFaceApi(): Promise<any> {
  if (typeof window === "undefined") throw new Error("face-api requires browser");
  if (window.faceapi && (window as any).__faceapi_loaded) return window.faceapi;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (!window.faceapi) {
      let scriptErr: unknown = null;
      for (const src of SCRIPT_URLS) {
        try {
          await loadScript(src);
          if (window.faceapi) break;
        } catch (e) {
          scriptErr = e;
        }
      }
      if (!window.faceapi) throw scriptErr ?? new Error("Failed to load face-api.js");
    }
    await loadModelsWithFallback(window.faceapi);
    (window as any).__faceapi_loaded = true;
    return window.faceapi;
  })().catch((err) => {
    // Clear the cached rejection so the user can retry without a hard reload.
    loadPromise = null;
    throw err;
  });
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
