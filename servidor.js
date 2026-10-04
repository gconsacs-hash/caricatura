// servidor.js — servidor estático mínimo (Node puro, sin dependencias).
// Hace falta porque el navegador no deja cargar módulos ni el wasm desde file://

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PUERTO || 3300);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const servidor = http.createServer((pet, res) => {
  let ruta = decodeURIComponent((pet.url || '/').split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  const destino = path.join(RAIZ, path.normalize(ruta));
  if (!destino.startsWith(RAIZ)) {
    res.writeHead(403).end('Fuera de la carpeta');
    return;
  }
  fs.stat(destino, (err, info) => {
    if (err || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    const cabeceras = {
      'content-type': TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-cache',
    };
    // GitHub Pages no envía estas cabeceras, así que por omisión aquí tampoco: lo que se
    // prueba en local debe ser lo mismo que se publica. PUERTO=... AISLAR=1 node servidor.js
    // las añade, por si alguna vez hace falta el wasm con hilos.
    if (process.env.AISLAR === '1') {
      cabeceras['cross-origin-opener-policy'] = 'same-origin';
      cabeceras['cross-origin-embedder-policy'] = 'require-corp';
      cabeceras['cross-origin-resource-policy'] = 'same-origin';
    }
    res.writeHead(200, cabeceras);
    fs.createReadStream(destino).pipe(res);
  });
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`\n  Caricatura en marcha:  http://localhost:${PUERTO}\n  (Ctrl+C para detener)\n`);
});
