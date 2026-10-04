// geometria.js — utilidades de vectores, polígonos y marcos de referencia.
// Sin dependencias del navegador: se puede importar desde Node para las pruebas.

export const v = (x, y) => ({ x, y });

export const suma = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const resta = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const escalar = (a, k) => ({ x: a.x * k, y: a.y * k });
export const punto = (a, b) => a.x * b.x + a.y * b.y;
export const cruz = (a, b) => a.x * b.y - a.y * b.x;
export const largo = (a) => Math.hypot(a.x, a.y);
export const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function centroide(puntos) {
  let sx = 0, sy = 0;
  for (const p of puntos) { sx += p.x; sy += p.y; }
  return { x: sx / puntos.length, y: sy / puntos.length };
}

/** Tamaño de centroide: raíz del promedio de distancias al cuadrado respecto al centroide.
 *  Es la medida de escala estándar en análisis de forma (Procrustes) y no privilegia
 *  ninguna distancia concreta, así que ninguna proporción queda "congelada" por el normalizado. */
export function tamanoCentroide(puntos) {
  const c = centroide(puntos);
  let s = 0;
  for (const p of puntos) s += (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
  return Math.sqrt(s / puntos.length);
}

export function rotar(p, rad, centro = { x: 0, y: 0 }) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const dx = p.x - centro.x, dy = p.y - centro.y;
  return { x: centro.x + dx * c - dy * s, y: centro.y + dx * s + dy * c };
}

/** Marco normalizado del rostro: origen en el punto medio de las pupilas, eje X sobre
 *  la línea de los ojos (corrige la inclinación de la cabeza) y unidad = tamaño de centroide
 *  de los puntos de referencia. Devuelve las dos transformaciones. */
export function marco({ centro, rad, escala }) {
  const c = Math.cos(-rad), s = Math.sin(-rad);
  const ci = Math.cos(rad), si = Math.sin(rad);
  return {
    centro, rad, escala,
    aNormal(p) {
      const dx = p.x - centro.x, dy = p.y - centro.y;
      return { x: (dx * c - dy * s) / escala, y: (dx * s + dy * c) / escala };
    },
    aImagen(p) {
      const x = p.x * escala, y = p.y * escala;
      return { x: centro.x + x * ci - y * si, y: centro.y + x * si + y * ci };
    },
  };
}

/** Ancho de un polígono cerrado a la altura y (suma de los tramos cortados por la
 *  horizontal). Devuelve {izq, der, ancho} usando el corte más externo de cada lado. */
export function anchoPoligonoEn(poligono, y) {
  let min = Infinity, max = -Infinity, cortes = 0;
  for (let i = 0; i < poligono.length; i++) {
    const a = poligono[i], b = poligono[(i + 1) % poligono.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y);
      const x = a.x + t * (b.x - a.x);
      if (x < min) min = x;
      if (x > max) max = x;
      cortes++;
    }
  }
  if (cortes < 2) return null;
  return { izq: min, der: max, ancho: max - min };
}

/** Interpolación suave de Hermite entre 0 y 1 (bordes blandos de las regiones). */
export function suavizar(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Ruido determinista en [-1,1]: da temblor de trazo reproducible sin Math.random. */
export function ruido(i, semilla = 1) {
  const x = Math.sin((i + 1) * 127.1 + semilla * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Envolvente convexa (cadena monótona de Andrew). Sirve para la silueta de la cabeza
 *  completa, incluyendo el cráneo estimado que la malla no cubre. */
export function envolvente(puntos) {
  const p = [...puntos].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (p.length < 3) return p;
  const cruzado = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const mitad = (lista) => {
    const pila = [];
    for (const q of lista) {
      while (pila.length >= 2 && cruzado(pila[pila.length - 2], pila[pila.length - 1], q) <= 0) pila.pop();
      pila.push(q);
    }
    return pila;
  };
  const inferior = mitad(p);
  const superior = mitad([...p].reverse());
  return [...inferior.slice(0, -1), ...superior.slice(0, -1)];
}

/** Infla un polígono respecto a su centro un porcentaje dado. */
export function inflar(poligono, porcentaje) {
  const c = centroide(poligono);
  const k = 1 + porcentaje / 100;
  return poligono.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
}

/** Suaviza una polilínea cerrada o abierta con Chaikin (trazos más orgánicos). */
export function chaikin(puntos, pasadas = 2, cerrado = false) {
  let p = puntos;
  for (let k = 0; k < pasadas; k++) {
    const salida = [];
    const n = p.length;
    if (!cerrado) salida.push(p[0]);
    const fin = cerrado ? n : n - 1;
    for (let i = 0; i < fin; i++) {
      const a = p[i], b = p[(i + 1) % n];
      salida.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      salida.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!cerrado) salida.push(p[n - 1]);
    p = salida;
  }
  return p;
}
