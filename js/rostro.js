// rostro.js — un "rostro" es una lista de puntos en coordenadas de imagen, más el
// anillo de la silueta, los puntos de referencia y los grupos de rasgos. Da igual si
// viene de la malla automática (478 puntos) o del trazado manual (plantilla del canon):
// el resto de la app trabaja siempre con esta misma estructura.

import { construirCanon, REFERENCIAS } from './canon.js';
import { centroide, tamanoCentroide, marco, anchoPoligonoEn, distancia } from './geometria.js';

// --- índices de la malla de MediaPipe Face Landmarker (478 puntos) ---
const MP = {
  ovalo: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
    54, 103, 67, 109],
  irisD: [473, 474, 475, 476, 477],
  irisI: [468, 469, 470, 471, 472],
  ojoDExt: 263, ojoDInt: 362, ojoDSup: 386, ojoDInf: 374,
  ojoIExt: 33, ojoIInt: 133, ojoISup: 159, ojoIInf: 145,
  cejaD: [336, 296, 334, 293, 300], cejaI: [70, 63, 105, 66, 107],
  nasion: 168, puntaNariz: 1, subnasal: 2, alarD: 327, alarI: 98,
  comisuraD: 291, comisuraI: 61, labioSup: 0, labioInf: 17,
  bocaExt: [291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61, 146, 91, 181, 84, 17, 314, 405, 321, 375],
  ojoDAnillo: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
  ojoIAnillo: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  nariz: [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327, 97, 326, 129, 358, 49, 279],
};

/** Construye un rostro desde el resultado del Face Landmarker.
 *  `marcas` son los 478 puntos normalizados (x,y en 0..1). */
export function desdeMalla(marcas, ancho, alto) {
  const puntos = marcas.map((m) => ({ x: m.x * ancho, y: m.y * alto }));
  const tieneIris = puntos.length >= 478;

  // Las pupilas se añaden como puntos extra: el centro del iris si lo hay,
  // o el centro del párpado si el modelo no entregó iris.
  const centroDe = (idx) => centroide(idx.map((i) => puntos[i]));
  const pupilaD = tieneIris ? centroDe(MP.irisD)
    : centroDe([MP.ojoDExt, MP.ojoDInt, MP.ojoDSup, MP.ojoDInf]);
  const pupilaI = tieneIris ? centroDe(MP.irisI)
    : centroDe([MP.ojoIExt, MP.ojoIInt, MP.ojoISup, MP.ojoIInf]);
  const iPupilaD = puntos.push(pupilaD) - 1;
  const iPupilaI = puntos.push(pupilaI) - 1;

  return {
    puntos,
    ovalo: MP.ovalo,
    modo: 'auto',
    ancho, alto,
    refs: {
      pupilaD: iPupilaD, pupilaI: iPupilaI,
      ojoDExt: MP.ojoDExt, ojoDInt: MP.ojoDInt, ojoDSup: MP.ojoDSup, ojoDInf: MP.ojoDInf,
      ojoIExt: MP.ojoIExt, ojoIInt: MP.ojoIInt, ojoISup: MP.ojoISup, ojoIInf: MP.ojoIInf,
      nasion: MP.nasion, puntaNariz: MP.puntaNariz, subnasal: MP.subnasal,
      alarD: MP.alarD, alarI: MP.alarI,
      comisuraD: MP.comisuraD, comisuraI: MP.comisuraI,
      labioSup: MP.labioSup, labioInf: MP.labioInf,
      stomion: MP.labioSup, menton: 152,
    },
    grupos: {
      ojoD: MP.ojoDAnillo, ojoI: MP.ojoIAnillo,
      cejaD: MP.cejaD, cejaI: MP.cejaI,
      boca: MP.bocaExt, nariz: MP.nariz,
    },
  };
}

// --- modo manual ---------------------------------------------------------------

/** Los puntos que el usuario marca a mano, en el orden en que se le piden. */
export const GUIA_MANUAL = [
  { id: 'pupilaI', texto: 'Pupila izquierda (la que ves a la izquierda)' },
  { id: 'pupilaD', texto: 'Pupila derecha' },
  { id: 'ojoIExt', texto: 'Esquina externa del ojo izquierdo' },
  { id: 'ojoIInt', texto: 'Esquina interna del ojo izquierdo (lagrimal)' },
  { id: 'ojoDInt', texto: 'Esquina interna del ojo derecho' },
  { id: 'ojoDExt', texto: 'Esquina externa del ojo derecho' },
  { id: 'cejaI', texto: 'Punto más alto de la ceja izquierda' },
  { id: 'cejaD', texto: 'Punto más alto de la ceja derecha' },
  { id: 'nasion', texto: 'Raíz de la nariz (entre los ojos)' },
  { id: 'puntaNariz', texto: 'Punta de la nariz' },
  { id: 'alarI', texto: 'Ala izquierda de la nariz' },
  { id: 'alarD', texto: 'Ala derecha de la nariz' },
  { id: 'comisuraI', texto: 'Comisura izquierda de la boca' },
  { id: 'comisuraD', texto: 'Comisura derecha de la boca' },
  { id: 'labioSup', texto: 'Borde superior del labio de arriba' },
  { id: 'labioInf', texto: 'Borde inferior del labio de abajo' },
  { id: 'menton', texto: 'Base del mentón' },
  { id: 'mandibulaI', texto: 'Ángulo de la mandíbula izquierda (bajo la oreja)' },
  { id: 'mandibulaD', texto: 'Ángulo de la mandíbula derecha' },
  { id: 'sienI', texto: 'Sien izquierda (borde de la cabeza)' },
  { id: 'sienD', texto: 'Sien derecha (borde de la cabeza)' },
  { id: 'coronilla', texto: 'Alto de la cabeza (coronilla o pelo)' },
];

/** Construye un rostro completo a partir de los puntos marcados a mano: toma la
 *  plantilla del canon y la deforma para que sus referencias caigan sobre las marcas
 *  del usuario (ajuste de semejanza global + corrección local por rasgo). */
export function desdeManual(marcadas, ancho, alto) {
  const plantilla = construirCanon(400, 0, 0);
  const puntos = plantilla.puntos.map((p) => ({ ...p }));
  const refs = plantilla.refs;
  const pt = (nombre) => puntos[refs[nombre]];

  // 1. semejanza global: alinea las pupilas de la plantilla con las marcadas.
  const pdP = pt('pupilaD'), piP = pt('pupilaI');
  const pdU = marcadas.pupilaD, piU = marcadas.pupilaI;
  const dP = distancia(pdP, piP), dU = distancia(pdU, piU);
  const k = dU / dP;
  const angP = Math.atan2(pdP.y - piP.y, pdP.x - piP.x);
  const angU = Math.atan2(pdU.y - piU.y, pdU.x - piU.x);
  const rot = angU - angP;
  const cP = { x: (pdP.x + piP.x) / 2, y: (pdP.y + piP.y) / 2 };
  const cU = { x: (pdU.x + piU.x) / 2, y: (pdU.y + piU.y) / 2 };
  const cos = Math.cos(rot), sin = Math.sin(rot);
  for (const p of puntos) {
    const dx = (p.x - cP.x) * k, dy = (p.y - cP.y) * k;
    p.x = cU.x + dx * cos - dy * sin;
    p.y = cU.y + dx * sin + dy * cos;
  }

  // 2. corrección local: cada marca tira de los puntos cercanos con caída suave.
  //    Equivale a un warp de puntos de control, pero sobre la malla y no sobre la imagen.
  const paresDirectos = ['ojoIExt', 'ojoIInt', 'ojoDInt', 'ojoDExt', 'nasion',
    'puntaNariz', 'alarI', 'alarD', 'comisuraI', 'comisuraD', 'labioSup', 'labioInf', 'menton'];
  const controles = [];
  for (const nombre of paresDirectos) {
    if (!marcadas[nombre]) continue;
    const origen = pt(nombre);
    controles.push({ p: { ...origen }, d: { x: marcadas[nombre].x - origen.x, y: marcadas[nombre].y - origen.y } });
  }
  // cejas: la marca es el pico del arco
  for (const [nombre, grupo] of [['cejaI', 'cejaI'], ['cejaD', 'cejaD']]) {
    if (!marcadas[nombre]) continue;
    const pico = puntos[plantilla.grupos[grupo][2]];
    controles.push({ p: { ...pico }, d: { x: marcadas[nombre].x - pico.x, y: marcadas[nombre].y - pico.y } });
  }
  // silueta: sienes y coronilla mueven el óvalo
  const ov = plantilla.ovalo;
  const medio = Math.floor(ov.length / 2);
  if (marcadas.coronilla) {
    const c = puntos[ov[0]];
    controles.push({ p: { ...c }, d: { x: marcadas.coronilla.x - c.x, y: marcadas.coronilla.y - c.y } });
  }
  for (const [nombre, signo] of [['sienD', 1], ['sienI', -1], ['mandibulaD', 1], ['mandibulaI', -1]]) {
    if (!marcadas[nombre]) continue;
    // punto del óvalo más cercano en altura a la marca, del lado correspondiente
    let mejor = null, mejorD = Infinity;
    for (let i = 0; i < ov.length; i++) {
      const p = puntos[ov[i]];
      const lado = (i > 0 && i < medio) ? 1 : -1;
      if (lado !== signo) continue;
      const d = Math.abs(p.y - marcadas[nombre].y);
      if (d < mejorD) { mejorD = d; mejor = p; }
    }
    if (mejor) controles.push({ p: { ...mejor }, d: { x: marcadas[nombre].x - mejor.x, y: marcadas[nombre].y - mejor.y } });
  }

  const radio = dU * 1.1;
  const movidos = puntos.map((p) => {
    let sx = 0, sy = 0, sw = 0;
    for (const c of controles) {
      const dist = Math.hypot(p.x - c.p.x, p.y - c.p.y);
      const w = 1 / (1 + (dist / (radio * 0.55)) ** 2.2);
      sx += c.d.x * w; sy += c.d.y * w; sw += w;
    }
    if (sw < 1e-9) return p;
    return { x: p.x + sx / sw, y: p.y + sy / sw };
  });

  return {
    puntos: movidos,
    ovalo: plantilla.ovalo,
    modo: 'manual',
    ancho, alto,
    refs: plantilla.refs,
    grupos: plantilla.grupos,
  };
}

// --- consultas sobre un rostro -------------------------------------------------

export const ref = (rostro, nombre) => rostro.puntos[rostro.refs[nombre]];

/** Marco normalizado: ojos horizontales, origen entre las pupilas, unidad = tamaño
 *  de centroide de las referencias. */
export function marcoDe(rostro) {
  const pd = ref(rostro, 'pupilaD'), pi = ref(rostro, 'pupilaI');
  const rad = Math.atan2(pd.y - pi.y, pd.x - pi.x);
  const centro = { x: (pd.x + pi.x) / 2, y: (pd.y + pi.y) / 2 };
  const refsPts = REFERENCIAS.map((n) => ref(rostro, n));
  const escala = tamanoCentroide(refsPts);
  return marco({ centro, rad, escala });
}

/** Devuelve el rostro con todos sus puntos en el marco normalizado. */
export function normalizar(rostro) {
  const m = marcoDe(rostro);
  return { ...rostro, puntos: rostro.puntos.map((p) => m.aNormal(p)), marco: m };
}

/** Ancho de la silueta a una altura dada, en el marco normalizado. */
export function anchoEn(rostroNorm, y) {
  const poli = rostroNorm.ovalo.map((i) => rostroNorm.puntos[i]);
  const r = anchoPoligonoEn(poli, y);
  return r ? r.ancho : null;
}

/** Correspondencia espejo: para cada punto, el índice de su contraparte al otro lado
 *  del eje de simetría. Se calcula por vecino más cercano sobre la malla reflejada,
 *  así no hace falta una tabla de índices. */
export function mapaEspejo(rostroNorm) {
  const p = rostroNorm.puntos;
  const n = p.length;
  const mapa = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const ex = -p[i].x, ey = p[i].y;
    let mejor = i, mejorD = Infinity;
    for (let j = 0; j < n; j++) {
      const d = (p[j].x - ex) ** 2 + (p[j].y - ey) ** 2;
      if (d < mejorD) { mejorD = d; mejor = j; }
    }
    mapa[i] = mejor;
  }
  return mapa;
}
