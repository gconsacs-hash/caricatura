// trazo.js — dibujo de línea a partir de los puntos (ya exagerados). Es el acabado que
// no depende de la calidad de la foto: contornos limpios, grosor variable y un temblor
// determinista para que la línea no parezca de ordenador.

import { chaikin, ruido, distancia, tamanoCentroide } from './geometria.js';
import { REFERENCIAS } from './canon.js';

/** Escala característica del rostro en píxeles (para que los grosores acompañen). */
export function unidad(rostro) {
  return tamanoCentroide(REFERENCIAS.map((n) => rostro.puntos[rostro.refs[n]]));
}

function temblar(puntos, amplitud, semilla) {
  return puntos.map((p, i) => ({
    x: p.x + ruido(i, semilla) * amplitud,
    y: p.y + ruido(i, semilla + 97) * amplitud,
  }));
}

/**
 * Trazos del rostro. Cada trazo: {puntos, ancho, anchoFin, cerrado, clase}.
 * `clase` permite al renderizador decidir el color y la presión.
 */
export function trazos(rostro, o = {}) {
  const u = unidad(rostro);
  const P = (n) => rostro.puntos[rostro.refs[n]];
  const G = (n) => rostro.grupos[n].map((i) => rostro.puntos[i]);
  const temblor = (o.temblor ?? 0.5) * u * 0.012;
  const lista = [];
  const añadir = (puntos, opc) => lista.push({
    puntos: temblar(puntos, temblor, opc.semilla ?? 1),
    ancho: opc.ancho, anchoFin: opc.anchoFin ?? opc.ancho,
    cerrado: !!opc.cerrado, clase: opc.clase ?? 'linea',
  });

  // --- silueta: más peso abajo y en el lado de sombra, como en una entintada ---
  const ovalo = chaikin(rostro.ovalo.map((i) => rostro.puntos[i]), 2, true);
  añadir(ovalo, { ancho: u * 0.035, anchoFin: u * 0.055, cerrado: true, clase: 'silueta', semilla: 3 });

  // --- cejas: polilínea ordenada por X, con pelo marcado ---
  for (const [nombre, semilla] of [['cejaD', 11], ['cejaI', 13]]) {
    const pts = chaikin([...G(nombre)].sort((a, b) => a.x - b.x), 2, false);
    añadir(pts, { ancho: u * 0.030, anchoFin: u * 0.012, clase: 'ceja', semilla });
  }

  // --- ojos: anillo del párpado, iris y pupila ---
  for (const [nombre, ext, int, pup, semilla] of [
    ['ojoD', 'ojoDExt', 'ojoDInt', 'pupilaD', 21],
    ['ojoI', 'ojoIExt', 'ojoIInt', 'pupilaI', 23]]) {
    const anillo = chaikin(G(nombre), 2, true);
    añadir(anillo, { ancho: u * 0.022, anchoFin: u * 0.034, cerrado: true, clase: 'ojo', semilla });
    const ancho = distancia(P(ext), P(int));
    const r = ancho * 0.21;
    const c = P(pup);
    const circ = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      circ.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
    }
    añadir(circ, { ancho: u * 0.020, cerrado: true, clase: 'iris', semilla: semilla + 1 });
    lista.push({ puntos: [c], radio: r * 0.45, clase: 'pupila' });
  }

  // --- nariz: caballete por un solo lado, alas y fosas ---
  const nasion = P('nasion'), punta = P('puntaNariz'), sub = P('subnasal');
  const alarD = P('alarD'), alarI = P('alarI');
  const ladoSombra = o.ladoSombra ?? 1;   // 1 = luz por la izquierda de la imagen
  const caballete = chaikin([
    { x: nasion.x + (alarD.x - alarI.x) * 0.06 * ladoSombra, y: nasion.y + (punta.y - nasion.y) * 0.25 },
    { x: nasion.x + (alarD.x - alarI.x) * 0.10 * ladoSombra, y: nasion.y + (punta.y - nasion.y) * 0.65 },
    { x: punta.x + (alarD.x - alarI.x) * 0.12 * ladoSombra, y: punta.y },
  ], 2, false);
  añadir(caballete, { ancho: u * 0.014, anchoFin: u * 0.026, clase: 'nariz', semilla: 31 });
  for (const [alar, signo, semilla] of [[alarD, 1, 33], [alarI, -1, 35]]) {
    const ala = chaikin([
      { x: punta.x + signo * Math.abs(punta.x - alar.x) * 0.35, y: punta.y - (sub.y - punta.y) * 0.25 },
      { x: alar.x, y: alar.y - (sub.y - punta.y) * 0.15 },
      { x: alar.x - signo * Math.abs(punta.x - alar.x) * 0.25, y: sub.y },
      { x: punta.x + signo * Math.abs(punta.x - alar.x) * 0.30, y: sub.y + (sub.y - punta.y) * 0.05 },
    ], 2, false);
    añadir(ala, { ancho: u * 0.024, anchoFin: u * 0.014, clase: 'nariz', semilla });
  }

  // --- boca: anillo de labios + línea de cierre más pesada ---
  const boca = chaikin(G('boca'), 2, true);
  añadir(boca, { ancho: u * 0.018, anchoFin: u * 0.026, cerrado: true, clase: 'boca', semilla: 41 });
  const cierre = chaikin([P('comisuraI'), { x: (P('comisuraI').x + P('stomion').x) / 2, y: P('stomion').y },
    P('stomion'), { x: (P('comisuraD').x + P('stomion').x) / 2, y: P('stomion').y }, P('comisuraD')], 2, false);
  añadir(cierre, { ancho: u * 0.045, anchoFin: u * 0.020, clase: 'boca', semilla: 43 });

  return lista;
}

const COLORES = {
  tinta: { silueta: '#141210', ceja: '#141210', ojo: '#141210', iris: '#141210', pupila: '#141210', nariz: '#141210', boca: '#141210', linea: '#141210', guia: 'rgba(30,70,140,0.42)' },
  lapiz: { silueta: '#3a3734', ceja: '#2e2c29', ojo: '#36332f', iris: '#36332f', pupila: '#23211e', nariz: '#454239', boca: '#3a3734', linea: '#3a3734', guia: 'rgba(120,110,95,0.55)' },
};

/** Dibuja una lista de trazos en un contexto 2D. */
export function pintarTrazos(ctx, lista, o = {}) {
  const paleta = COLORES[o.paleta || 'tinta'];
  const escalaAncho = o.escalaAncho ?? 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const t of lista) {
    const color = o.color || paleta[t.clase] || paleta.linea;
    if (t.clase === 'pupila') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(t.puntos[0].x, t.puntos[0].y, Math.max(0.8, t.radio * escalaAncho), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const pts = t.puntos;
    const n = pts.length;
    if (n < 2) continue;
    ctx.strokeStyle = color;
    const fin = t.cerrado ? n : n - 1;
    for (let i = 0; i < fin; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      // el grosor recorre el trazo de `ancho` a `anchoFin` (presión de la mano)
      const t0 = i / Math.max(1, fin - 1);
      const peso = t.ancho + (t.anchoFin - t.ancho) * (t.cerrado ? Math.sin(t0 * Math.PI) : t0);
      ctx.lineWidth = Math.max(0.4, peso * escalaAncho);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

/** Exporta los trazos como SVG (grosor medio por trazo). */
export function trazosASvg(lista, ancho, alto, o = {}) {
  const paleta = { ...COLORES[o.paleta || 'tinta'], ...(o.colores || {}) };
  const fondo = o.fondo || '#faf6ee';
  const partes = [`<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">`,
    `<rect width="${ancho}" height="${alto}" fill="${fondo}"/>`];
  for (const t of lista) {
    const color = paleta[t.clase] || paleta.linea;
    if (t.clase === 'pupila') {
      partes.push(`<circle cx="${t.puntos[0].x.toFixed(1)}" cy="${t.puntos[0].y.toFixed(1)}" r="${Math.max(0.8, t.radio * 0.9).toFixed(1)}" fill="${color}"/>`);
      continue;
    }
    if (t.puntos.length < 2) continue;
    const d = t.puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      + (t.cerrado ? ' Z' : '');
    const w = ((t.ancho + t.anchoFin) / 2).toFixed(2);
    partes.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  partes.push('</svg>');
  return partes.join('\n');
}
