// deteccion.js — localiza los 478 puntos del rostro con MediaPipe Face Landmarker.
// El modelo y el wasm están en vendor/, así que funciona sin internet.

let detector = null;
let cargando = null;

export function estaListo() { return detector !== null; }

export async function cargar() {
  if (detector) return detector;
  if (cargando) return cargando;
  cargando = (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('../vendor/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks('vendor/wasm');
    const opciones = (delegate) => ({
      baseOptions: { modelAssetPath: 'vendor/face_landmarker.task', delegate },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
    try {
      detector = await FaceLandmarker.createFromOptions(fileset, opciones('GPU'));
    } catch (e) {
      detector = await FaceLandmarker.createFromOptions(fileset, opciones('CPU'));
    }
    return detector;
  })();
  return cargando;
}

/**
 * Detecta un rostro en un canvas o imagen.
 * @returns {{marcas:Array, matriz:Array|null}|null}
 */
export async function detectar(fuente) {
  const d = await cargar();
  const r = d.detect(fuente);
  if (!r || !r.faceLandmarks || r.faceLandmarks.length === 0) return null;
  return {
    marcas: r.faceLandmarks[0],
    matriz: r.facialTransformationMatrixes && r.facialTransformationMatrixes[0]
      ? r.facialTransformationMatrixes[0].data : null,
  };
}

/** Ángulos de la cabeza (grados) a partir de la matriz de transformación, si la hay. */
export function angulos(matriz) {
  if (!matriz) return null;
  const m = matriz;
  const giro = Math.atan2(-m[8], Math.hypot(m[9], m[10]));
  const cabeceo = Math.atan2(m[9], m[10]);
  const inclinacion = Math.atan2(m[4], m[0]);
  const g = (r) => (r * 180) / Math.PI;
  return { giro: g(giro), cabeceo: g(cabeceo), inclinacion: g(inclinacion) };
}
