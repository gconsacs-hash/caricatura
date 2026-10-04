import { prueba, cerca, cierto, igual, finitos } from './prueba.mjs';
import { aGris, desenfoque, lineas, gradientes, niveles, hachuras, mascaraPoligono, aImageData } from '../js/imagen.js';
import { construirCanon } from '../js/canon.js';
import { trazos, trazosASvg, unidad } from '../js/trazo.js';
import { construccion } from '../js/loomis.js';
import { medir } from '../js/medidas.js';
import { desdeManual, mapaEspejo, normalizar, GUIA_MANUAL } from '../js/rostro.js';

const crearImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });

function lleno(W, H, v) {
  const img = crearImageData(W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  return img;
}

prueba('la luminancia de un gris medio es 0.5', () => {
  const g = aGris(lleno(4, 4, 128));
  cerca(g[0], 128 / 255, 1e-6);
});

prueba('el desenfoque conserva una imagen constante', () => {
  const g = new Float32Array(400).fill(0.4);
  const b = desenfoque(g, 20, 20, 3);
  for (let i = 0; i < b.length; i++) cerca(b[i], 0.4, 1e-5);
});

prueba('el desenfoque suaviza un escalón', () => {
  const W = 40, H = 4;
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = x < W / 2 ? 1 : 0;
  const b = desenfoque(g, W, H, 3);
  const centro = 2 * W + W / 2;
  cierto(b[centro] > 0.2 && b[centro] < 0.8, `valor ${b[centro]}`);
  cerca(b[2 * W + 1], 1, 0.05);
});

prueba('la línea no dibuja nada en una superficie clara y plana', () => {
  const g = new Float32Array(900).fill(0.6);
  const t = lineas(g, 30, 30);
  for (let i = 0; i < t.length; i++) cerca(t[i], 1, 1e-4);
});

prueba('la línea tampoco mancha una superficie OSCURA y plana', () => {
  // esto es lo que falla con el XDoG de umbral absoluto: el pelo se volvía un borrón
  const g = new Float32Array(900).fill(0.08);
  const t = lineas(g, 30, 30);
  for (let i = 0; i < t.length; i++) cerca(t[i], 1, 1e-4);
});

prueba('la línea entinta el borde de un escalón', () => {
  const W = 40, H = 20;
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = x < 20 ? 0.85 : 0.2;
  const t = lineas(g, W, H);
  const fila = 10 * W;
  let minimo = 1, posicion = -1;
  for (let x = 0; x < W; x++) if (t[fila + x] < minimo) { minimo = t[fila + x]; posicion = x; }
  cierto(minimo < 0.4, `el borde no se entintó (mínimo ${minimo})`);
  cierto(Math.abs(posicion - 20) <= 3, `la línea cayó en x=${posicion}`);
  cerca(t[fila + 2], 1, 0.05);
});

prueba('los gradientes detectan la dirección del borde', () => {
  const W = 20, H = 20;
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = x < 10 ? 1 : 0;
  const { gx, gy } = gradientes(g, W, H);
  const i = 10 * W + 10;
  cierto(Math.abs(gx[i]) > 1, `gx=${gx[i]}`);
  cerca(gy[i], 0, 1e-6);
});

prueba('niveles recorta y aplica gama', () => {
  const b = niveles(new Float32Array([-1, 0, 0.5, 1, 2]), { negro: 0, blanco: 1, gama: 1 });
  igual(b[0], 0); igual(b[4], 1); cerca(b[2], 0.5, 1e-6);
  const g = niveles(new Float32Array([0.25]), { negro: 0, blanco: 1, gama: 2 });
  cerca(g[0], 0.0625, 1e-6);
});

prueba('el tramado aparece en lo oscuro y no en lo claro', () => {
  const W = 60, H = 60;
  const oscuro = new Float32Array(W * H).fill(0.1);
  const claro = new Float32Array(W * H).fill(0.95);
  cierto(hachuras(oscuro, W, H).length > 20);
  igual(hachuras(claro, W, H).length, 0);
});

prueba('el tramado respeta la máscara', () => {
  const W = 60, H = 60;
  const oscuro = new Float32Array(W * H).fill(0.1);
  const mascara = mascaraPoligono([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]);
  const t = hachuras(oscuro, W, H, { mascara });
  cierto(t.length > 0);
  for (const s of t) {
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
    cierto(cx < 32 && cy < 32, `trazo fuera de la máscara en ${cx},${cy}`);
  }
});

prueba('los trazos del tramado son finitos y tienen longitud', () => {
  const W = 40, H = 40;
  const g = new Float32Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = (i % 40) / 40;
  const t = hachuras(g, W, H);
  for (const s of t) {
    cierto(Number.isFinite(s.x1) && Number.isFinite(s.y2), 'coordenada no finita');
    cierto(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 0.5, 'trazo de longitud nula');
    cierto(s.alfa > 0 && s.alfa <= 1);
  }
});

prueba('la máscara de polígono distingue dentro y fuera', () => {
  const m = mascaraPoligono([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
  igual(m(5, 5), 1);
  igual(m(20, 5), 0);
});

prueba('aImageData convierte 0 en tinta y 1 en papel', () => {
  const img = aImageData(new Float32Array([0, 1]), 2, 1, crearImageData, [10, 10, 10]);
  igual(img.data[0], 10);
  igual(img.data[4], 255);
  igual(img.data[3], 255);
});

// --- trazo y construcción ---
const canon = () => construirCanon(400, 0, 0);

prueba('el dibujo de línea produce trazos finitos de todas las clases', () => {
  const r = canon();
  const t = trazos(r);
  const clases = new Set(t.map((x) => x.clase));
  for (const c of ['silueta', 'ceja', 'ojo', 'nariz', 'boca', 'iris', 'pupila']) {
    cierto(clases.has(c), `falta la clase ${c}`);
  }
  for (const x of t) finitos(x.puntos, x.clase);
});

prueba('la unidad de trazo escala con el tamaño del rostro', () => {
  cerca(unidad(construirCanon(800, 0, 0)) / unidad(construirCanon(400, 0, 0)), 2, 1e-9);
});

prueba('el SVG exportado contiene trazos y fondo', () => {
  const svg = trazosASvg(trazos(canon()), 500, 600);
  cierto(svg.startsWith('<svg'));
  cierto(svg.includes('</svg>'));
  cierto((svg.match(/<path/g) || []).length > 5);
  cierto(!svg.includes('NaN'), 'el SVG tiene NaN');
});

prueba('la construcción de Loomis da la esfera, la cruz y las divisiones', () => {
  const r = canon();
  const c = construccion(r, medir(r));
  const clases = new Set(c.map((x) => x.clase));
  for (const k of ['esfera', 'plano', 'cruz', 'mandibula', 'division', 'oreja']) {
    cierto(clases.has(k), `falta ${k}`);
  }
  for (const x of c) finitos(x.puntos, x.clase);
  cierto(c.some((x) => x.etiqueta === 'ojos'));
});

prueba('la esfera de la construcción va de la coronilla a la base de la nariz', () => {
  const r = canon();
  const m = medir(r);
  const c = construccion(r, m);
  const esfera = c.find((x) => x.clase === 'esfera');
  const ys = esfera.puntos.map((p) => p.y);
  const arriba = Math.min(...ys), abajo = Math.max(...ys);
  const subnasal = r.puntos[r.refs.subnasal].y;
  const menton = r.puntos[r.refs.menton].y;
  const ojos = (r.puntos[r.refs.pupilaD].y + r.puntos[r.refs.pupilaI].y) / 2;
  const coronillaEstimada = ojos - (menton - ojos);
  cerca(arriba, coronillaEstimada, 3, 'la esfera no empieza en la coronilla');
  cerca(abajo, subnasal, 3, 'la esfera no acaba en la base de la nariz');
});

// --- modo manual ---
prueba('el modo manual coloca los puntos donde los marcó el usuario', () => {
  const r = canon();
  const marcadas = {};
  for (const g of GUIA_MANUAL) {
    if (r.refs[g.id] !== undefined) marcadas[g.id] = { ...r.puntos[r.refs[g.id]] };
  }
  marcadas.cejaI = { ...r.puntos[r.grupos.cejaI[2]] };
  marcadas.cejaD = { ...r.puntos[r.grupos.cejaD[2]] };
  marcadas.coronilla = { ...r.puntos[r.ovalo[0]] };
  marcadas.sienI = { x: -0.34 * 400, y: 0.46 * 400 };
  marcadas.sienD = { x: 0.34 * 400, y: 0.46 * 400 };
  const hecho = desdeManual(marcadas, 800, 800);
  for (const nombre of ['pupilaI', 'pupilaD', 'menton', 'comisuraD', 'puntaNariz']) {
    const p = hecho.puntos[hecho.refs[nombre]];
    cierto(Math.hypot(p.x - marcadas[nombre].x, p.y - marcadas[nombre].y) < 12,
      `${nombre} quedó a ${Math.hypot(p.x - marcadas[nombre].x, p.y - marcadas[nombre].y).toFixed(1)} px`);
  }
  igual(hecho.modo, 'manual');
  finitos(hecho.puntos);
});

prueba('un rostro manual se puede medir y exagerar', () => {
  const r = canon();
  const marcadas = {};
  for (const g of GUIA_MANUAL) if (r.refs[g.id] !== undefined) marcadas[g.id] = { ...r.puntos[r.refs[g.id]] };
  marcadas.cejaI = { ...r.puntos[r.grupos.cejaI[2]] };
  marcadas.cejaD = { ...r.puntos[r.grupos.cejaD[2]] };
  // mentón 25% más abajo: rostro alargado
  marcadas.menton = { x: 0, y: 1.25 * 400 };
  const hecho = desdeManual(marcadas, 800, 800);
  const m = medir(hecho);
  cierto(m.largoCara > 0);
  const t = trazos(hecho);
  cierto(t.length > 5);
});

prueba('el mapa espejo empareja los dos ojos', () => {
  const r = canon();
  const n = normalizar(r);
  const mapa = mapaEspejo(n);
  igual(mapa[n.refs.pupilaD], n.refs.pupilaI);
  igual(mapa[n.refs.pupilaI], n.refs.pupilaD);
  igual(mapa[n.refs.comisuraD], n.refs.comisuraI);
});

prueba('la guía manual pide todos los puntos que las referencias necesitan', () => {
  const ids = new Set(GUIA_MANUAL.map((g) => g.id));
  for (const n of ['pupilaI', 'pupilaD', 'menton', 'nasion', 'subnasal']) {
    cierto(ids.has(n) || n === 'subnasal', `la guía no pide ${n}`);
  }
  cierto(GUIA_MANUAL.length >= 16);
});
