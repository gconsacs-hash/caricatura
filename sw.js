// sw.js — trabajador de servicio: deja la app instalada y funcionando sin conexión.
//
// El detector de rostros pesa ~16 MB. No se descarga al instalar (sería maltratar los
// datos de quien solo quiere mirar): se guarda la primera vez que se usa, o cuando el
// usuario pulsa "Guardar para usar sin conexión".

const VERSION = 'caricatura-v1';

// Lo mínimo para que la app abra y se vea aunque no haya red.
const CONCHA = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilo.css',
  './js/app.js',
  './js/canon.js',
  './js/rostro.js',
  './js/medidas.js',
  './js/exagerar.js',
  './js/mls.js',
  './js/imagen.js',
  './js/trazo.js',
  './js/loomis.js',
  './js/geometria.js',
  './js/deteccion.js',
  './js/demo.js',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-recortable-512.png',
];

// El detector: se guarda bajo demanda.
const DETECTOR = [
  './vendor/vision_bundle.mjs',
  './vendor/wasm/vision_wasm_internal.js',
  './vendor/wasm/vision_wasm_internal.wasm',
  './vendor/face_landmarker.task',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(CONCHA))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const peticion = e.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const guardado = await caches.match(peticion, { ignoreSearch: true });
    if (guardado) return guardado;
    try {
      const respuesta = await fetch(peticion);
      // Se guarda todo lo que sirva el propio sitio, incluido el wasm en cuanto se usa.
      if (respuesta && respuesta.ok && respuesta.type === 'basic') {
        const copia = respuesta.clone();
        caches.open(VERSION).then((c) => c.put(peticion, copia));
      }
      return respuesta;
    } catch (error) {
      // Sin red: cualquier navegación cae en la propia app.
      if (peticion.mode === 'navigate') {
        const inicio = await caches.match('./index.html');
        if (inicio) return inicio;
      }
      throw error;
    }
  })());
});

self.addEventListener('message', (e) => {
  const datos = e.data || {};
  if (datos.tipo === 'guardar-detector') {
    const responder = (mensaje) => {
      if (e.ports && e.ports[0]) e.ports[0].postMessage(mensaje);
    };
    (async () => {
      try {
        const c = await caches.open(VERSION);
        let hechos = 0;
        for (const url of DETECTOR) {
          const ya = await c.match(url);
          if (!ya) await c.add(url);
          hechos++;
          responder({ estado: 'progreso', hechos, total: DETECTOR.length });
        }
        responder({ estado: 'listo', total: DETECTOR.length });
      } catch (error) {
        responder({ estado: 'error', mensaje: String(error && error.message ? error.message : error) });
      }
    })();
  }
  if (datos.tipo === 'estado-detector') {
    (async () => {
      const c = await caches.open(VERSION);
      const presentes = await Promise.all(DETECTOR.map((u) => c.match(u).then((r) => !!r)));
      const puerto = e.ports && e.ports[0];
      if (puerto) puerto.postMessage({ guardado: presentes.every(Boolean) });
    })();
  }
});
