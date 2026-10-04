// iconos.mjs — genera los iconos PNG de la app sin depender de ninguna librería.
// Dibuja la construcción de Loomis: la esfera del cráneo, la cruz que fija la
// inclinación y la mandíbula colgando. Se rasteriza a 4x y se reduce, que es la forma
// más simple de conseguir bordes suaves.
//
//   node herramientas\iconos.mjs

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── codificador PNG ───────────────────────────────────────────────────────────

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

/** rgba: Uint8Array de ancho*alto*4 */
export function codificarPng(ancho, alto, rgba) {
  const filas = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    const destino = y * (ancho * 4 + 1);
    filas[destino] = 0;                       // filtro "ninguno"
    rgba.subarray(y * ancho * 4, (y + 1) * ancho * 4).forEach((v, i) => {
      filas[destino + 1 + i] = v;
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;        // bits por canal
  ihdr[9] = 6;        // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(filas, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

// ─── rasterizador mínimo ───────────────────────────────────────────────────────

const color = (hex) => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];

function lienzo(lado, fondo) {
  const px = new Float32Array(lado * lado * 3);
  const [r, g, b] = color(fondo);
  for (let i = 0; i < lado * lado; i++) {
    px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b;
  }
  return px;
}

/** Pinta en los píxeles donde `dentro(x,y)` es cierto; x,y van de 0 a 1. */
function pintar(px, lado, dentro, hex) {
  const [r, g, b] = color(hex);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if (!dentro((x + 0.5) / lado, (y + 0.5) / lado)) continue;
      const i = (y * lado + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }
}

const anillo = (cx, cy, rx, ry, grosor) => (x, y) => {
  const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
  const borde = grosor / ((rx + ry) / 2) / 2;
  return Math.abs(d - 1) < borde;
};

const segmento = (x1, y1, x2, y2, grosor) => (x, y) => {
  const dx = x2 - x1, dy = y2 - y1;
  const largo2 = dx * dx + dy * dy;
  let t = largo2 ? ((x - x1) * dx + (y - y1) * dy) / largo2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) < grosor / 2;
};

/** Arco achatado: la línea de cejas que envuelve la esfera. */
const arco = (cx, cy, rx, ry, grosor) => (x, y) => {
  if (Math.abs(x - cx) > rx) return false;
  const t = (x - cx) / rx;
  const yArco = cy + Math.sqrt(Math.max(0, 1 - t * t)) * ry;
  return Math.abs(y - yArco) < grosor / 2;
};

function dibujarIcono(ladoFinal, { margen = 0 } = {}) {
  const sup = 4;                                   // supermuestreo
  const lado = ladoFinal * sup;
  const px = lienzo(lado, '#171a20');

  // `margen` reserva la zona segura de los iconos recortables de Android
  const k = 1 - margen * 2;
  const m = (v) => margen + v * k;
  const g = (v) => v * k;

  const cx = m(0.5), cy = m(0.44), rx = g(0.30), ry = g(0.30);
  const claro = '#f1e9da', naranja = '#d98a3f';

  // mandíbula: de los lados de la esfera al mentón
  pintar(px, lado, segmento(m(0.5 - 0.26), m(0.56), m(0.5 - 0.20), m(0.80), g(0.050)), claro);
  pintar(px, lado, segmento(m(0.5 + 0.26), m(0.56), m(0.5 + 0.20), m(0.80), g(0.050)), claro);
  pintar(px, lado, segmento(m(0.5 - 0.20), m(0.80), m(0.5 + 0.20), m(0.80), g(0.050)), claro);

  // la esfera del cráneo
  pintar(px, lado, anillo(cx, cy, rx, ry, g(0.052)), claro);

  // la cruz de Loomis
  pintar(px, lado, arco(cx, m(0.40), g(0.285), g(0.055), g(0.044)), naranja);
  pintar(px, lado, segmento(cx, m(0.16), cx, m(0.74), g(0.042)), naranja);

  // reducción con promedio (antialiasing)
  const salida = new Uint8Array(ladoFinal * ladoFinal * 4);
  for (let y = 0; y < ladoFinal; y++) {
    for (let x = 0; x < ladoFinal; x++) {
      let r = 0, v = 0, b = 0;
      for (let j = 0; j < sup; j++) {
        for (let i = 0; i < sup; i++) {
          const o = ((y * sup + j) * lado + (x * sup + i)) * 3;
          r += px[o]; v += px[o + 1]; b += px[o + 2];
        }
      }
      const n = sup * sup, o = (y * ladoFinal + x) * 4;
      salida[o] = Math.round(r / n);
      salida[o + 1] = Math.round(v / n);
      salida[o + 2] = Math.round(b / n);
      salida[o + 3] = 255;
    }
  }
  return codificarPng(ladoFinal, ladoFinal, salida);
}

const destino = path.join(RAIZ, 'iconos');
fs.mkdirSync(destino, { recursive: true });

const archivos = [
  ['icono-192.png', dibujarIcono(192)],
  ['icono-512.png', dibujarIcono(512)],
  // los iconos recortables de Android pueden perder hasta un 20% por cada lado
  ['icono-recortable-512.png', dibujarIcono(512, { margen: 0.14 })],
];
for (const [nombre, datos] of archivos) {
  fs.writeFileSync(path.join(destino, nombre), datos);
  console.log(`${nombre.padEnd(28)} ${(datos.length / 1024).toFixed(1)} KB`);
}
