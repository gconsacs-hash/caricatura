// exagerar.js — convierte las desviaciones medidas en deformación geométrica.
//
// Regla única: exagerar = amplificar la desviación respecto al canon, nunca la medida.
//   objetivo = canon + (medido − canon) · (1 + k)
// Si el mentón del retratado es un 12% más corto que el canon y k = 1.5, el mentón de la
// caricatura será un 30% más corto. Los rasgos que ya son normales no se tocan: por eso
// el parecido se mantiene aunque la deformación sea fuerte.

import { MEDIDAS, desviaciones, contexto, medir } from './medidas.js';
import { normalizar, mapaEspejo } from './rostro.js';
import { suavizar, centroide } from './geometria.js';

const ORDEN = new Map(MEDIDAS.map((m, i) => [m.id, i]));
const rad = (g) => (g * Math.PI) / 180;

// --- regiones: peso 0..1 por punto, con borde blando ---------------------------

function banda({ desde, hasta }) {
  // peso 1 en `desde`, baja a 0 en `hasta` (sirve en los dos sentidos)
  return (p) => 1 - suavizar((p.y - desde) / (hasta - desde));
}
function bandaCentrada({ centro, radio, borde }) {
  return (p) => 1 - suavizar((Math.abs(p.y - centro) - radio) / borde);
}
function elipse({ cx, cy, rx, ry, borde = 0.45 }) {
  return (p) => {
    const t = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
    return 1 - suavizar((t - 1) / borde);
  };
}

/** Construye las regiones a partir del propio rostro (no de valores fijos),
 *  así funcionan igual en una cara larga y en una redonda. */
export function regiones(c, med) {
  const L = c.largoCara;
  const pupD = c.P('pupilaD'), pupI = c.P('pupilaI');
  const cejaCD = centroide(c.n.grupos.cejaD.map((i) => c.n.puntos[i]));
  const cejaCI = centroide(c.n.grupos.cejaI.map((i) => c.n.puntos[i]));
  const spanCeja = (g) => {
    const xs = g.map((i) => c.n.puntos[i].x);
    return Math.max(...xs) - Math.min(...xs);
  };
  const anchoOjo = med.anchoOjos || 0.22;
  const anchoNariz = med.anchoNariz || 0.3;
  const anchoBoca = med.anchoBoca || 0.45;
  const grosor = med.grosorLabios || 0.12;

  return {
    craneo: banda({ desde: c.yCeja, hasta: c.yMedioNariz + 0.25 * L }),
    pomulos: bandaCentrada({ centro: c.yMedioNariz, radio: 0.12 * L, borde: 0.28 * L }),
    // Cada banda vale 1 justo a la altura donde se mide ese ancho y se apaga hacia
    // arriba. Si la caída empezase en la propia altura de medición, el cambio se
    // aplicaría a medias precisamente donde tiene que notarse.
    mandibula: banda({ desde: c.stomion.y, hasta: c.yMedioNariz }),
    barbilla: banda({ desde: c.yMentonMedio, hasta: c.stomion.y }),
    bajoCeja: banda({ desde: c.yCeja + 0.05 * L, hasta: c.yCeja - 0.22 * L }),
    bajoBoca: banda({ desde: c.stomion.y + 0.05 * L, hasta: c.stomion.y - 0.06 * L }),
    nariz: elipse({
      cx: 0, cy: (c.nasion.y + c.subnasal.y) / 2,
      rx: Math.max(0.16, anchoNariz * 0.85), ry: Math.max(0.18, (c.subnasal.y - c.nasion.y) * 0.72),
    }),
    boca: elipse({ cx: 0, cy: c.stomion.y, rx: anchoBoca * 0.8, ry: Math.max(0.11, grosor * 2.0) }),
    ojoD: elipse({ cx: pupD.x, cy: pupD.y, rx: anchoOjo * 1.0, ry: anchoOjo * 0.72 }),
    ojoI: elipse({ cx: pupI.x, cy: pupI.y, rx: anchoOjo * 1.0, ry: anchoOjo * 0.72 }),
    cejaD: elipse({ cx: cejaCD.x, cy: cejaCD.y, rx: spanCeja(c.n.grupos.cejaD) * 0.75, ry: 0.13 }),
    cejaI: elipse({ cx: cejaCI.x, cy: cejaCI.y, rx: spanCeja(c.n.grupos.cejaI) * 0.75, ry: 0.13 }),
    todo: () => 1,
  };
}

// --- operaciones elementales -----------------------------------------------------

const escalaX = (f, anclaX) => (p) => ({ x: anclaX + (p.x - anclaX) * f, y: p.y });
const escalaY = (f, anclaY) => (p) => ({ x: p.x, y: anclaY + (p.y - anclaY) * f });
const trasladar = (dx, dy) => (p) => ({ x: p.x + dx, y: p.y + dy });
const girar = (r, cx, cy) => (p) => {
  const co = Math.cos(r), si = Math.sin(r), dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * co - dy * si, y: cy + dx * si + dy * co };
};

// Tope de la amplificación. Sin él, una intensidad alta sobre una desviación grande
// puede llevar una medida a cero (labios que desaparecen, ojos que se cierran). La
// tangente hiperbólica deja la zona normal casi intacta y solo frena en los extremos.
const LIMITE = 0.85;
const amplificar = (relativa, k) => LIMITE * Math.tanh((relativa * (1 + k)) / LIMITE);

/** Traduce una medida y su desviación amplificada en una lista de {peso, mapa}.
 *  Para los ángulos, `deltaForzado` permite corregir sobre el resultado ya deformado. */
function accionesDe(d, k, c, regs, med, deltaForzado = null) {
  const m = d.medida;
  const op = m.op;
  const R = regs;
  const salida = [];
  const pupD = c.P('pupilaD'), pupI = c.P('pupilaI');
  const anclas = {
    yCeja: c.yCeja, yStomion: c.stomion.y, yNasion: c.nasion.y,
  };

  if (m.tipo === 'escala') {
    // objetivo = canon·(1 + desv amplificada) ⇒ factor respecto al medido
    const objetivo = d.canon * (1 + amplificar(d.relativa, k));
    if (!(d.valor > 1e-9)) return salida;
    const f = Math.max(0.2, Math.min(4, objetivo / d.valor));
    switch (op.tipo) {
      case 'escalaX':
        salida.push({ peso: R[op.region], mapa: escalaX(f, op.anclaX ?? 0) });
        break;
      case 'escalaY':
        salida.push({ peso: R[op.region], mapa: escalaY(f, anclas[op.anclaY] ?? 0) });
        break;
      case 'separarOjos': {
        for (const [reg, pup] of [[R.ojoD, pupD], [R.ojoI, pupI]]) {
          salida.push({ peso: reg, mapa: trasladar((f - 1) * pup.x, 0) });
        }
        for (const [reg, pup] of [[R.cejaD, pupD], [R.cejaI, pupI]]) {
          salida.push({ peso: (p) => reg(p) * 0.6, mapa: trasladar((f - 1) * pup.x, 0) });
        }
        break;
      }
      case 'escalaXOjos':
        salida.push({ peso: R.ojoD, mapa: escalaX(f, pupD.x) });
        salida.push({ peso: R.ojoI, mapa: escalaX(f, pupI.x) });
        break;
      case 'escalaYOjos':
        salida.push({ peso: R.ojoD, mapa: escalaY(f, pupD.y) });
        salida.push({ peso: R.ojoI, mapa: escalaY(f, pupI.y) });
        break;
      case 'subirCejas': {
        const dy = -(objetivo - d.valor);
        salida.push({ peso: R.cejaD, mapa: trasladar(0, dy) });
        salida.push({ peso: R.cejaI, mapa: trasladar(0, dy) });
        break;
      }
      case 'bajarBoca': {
        const dy = objetivo - d.valor;
        salida.push({ peso: R.boca, mapa: trasladar(0, dy) });
        break;
      }
      default: break;
    }
    return salida;
  }

  if (m.tipo === 'angulo') {
    const delta = deltaForzado !== null ? deltaForzado : d.desv * k;   // grados que se añaden
    const giroLado = (reg, cx, cy, signo) => ({ peso: reg, mapa: girar(rad(delta) * signo, cx, cy) });
    if (op.tipo === 'rotarOjos') {
      // subir la comisura externa: en pantalla (y hacia abajo) es giro negativo del lado +x
      salida.push(giroLado(R.ojoD, pupD.x, pupD.y, pupD.x >= 0 ? -1 : 1));
      salida.push(giroLado(R.ojoI, pupI.x, pupI.y, pupI.x >= 0 ? -1 : 1));
    } else if (op.tipo === 'rotarCejas') {
      const cD = centroide(c.n.grupos.cejaD.map((i) => c.n.puntos[i]));
      const cI = centroide(c.n.grupos.cejaI.map((i) => c.n.puntos[i]));
      salida.push(giroLado(R.cejaD, cD.x, cD.y, cD.x >= 0 ? -1 : 1));
      salida.push(giroLado(R.cejaI, cI.x, cI.y, cI.x >= 0 ? -1 : 1));
    }
    return salida;
  }

  if (m.tipo === 'absoluto' && op.tipo === 'asimetria') {
    const delta = d.desv * k;
    if (!(d.valor > 1e-6)) return salida;
    salida.push({ tipo: 'asimetria', factor: delta / d.valor, peso: R.todo });
  }
  return salida;
}

export const AJUSTES_LIBRES = [
  { id: 'craneoAlto', etiqueta: 'Alto del cráneo', ayuda: 'La cúpula del cráneo no se puede medir en una foto de frente: es decisión del dibujante.' },
  { id: 'cuello', etiqueta: 'Proyección del mentón', ayuda: 'Adelanta o retrae el mentón, como en los perfiles de Loomis.' },
];

/**
 * Calcula el plan de exageración.
 * @param {object} medidas  salida de medir()
 * @param {object} canon    medidas de referencia
 * @param {object} opciones {intensidad, porMedida:{id:mult}, libres:{id:valor}}
 */
export function planExageracion(medidas, canon, opciones = {}) {
  const intensidad = opciones.intensidad ?? 1;
  const porMedida = opciones.porMedida || {};
  const ds = desviaciones(medidas, canon);
  const orden = [...ds].sort((a, b) => ORDEN.get(a.medida.id) - ORDEN.get(b.medida.id));
  return orden.map((d) => ({
    d,
    k: intensidad * (porMedida[d.medida.id] ?? 1),
  })).filter((x) => Math.abs(x.k) > 1e-6);
}

/**
 * Aplica la exageración. Devuelve puntos nuevos en coordenadas de IMAGEN.
 * @param {object} rostro
 * @param {object} medidas
 * @param {object} canon
 * @param {object} opciones
 * @param {Array}  extra  puntos adicionales (coordenadas de imagen) que se deforman igual
 */
export function exagerar(rostro, medidas, canon, opciones = {}, extra = []) {
  const n = rostro.marco ? rostro : normalizar(rostro);
  const c = medidas._contexto && medidas._contexto.n === n ? medidas._contexto : contexto(n);
  const regs = regiones(c, medidas);
  const plan = planExageracion(medidas, canon, opciones);

  const originales = n.puntos.map((p) => ({ ...p }));
  const extraNorm = extra.map((p) => n.marco.aNormal(p));
  const extraOrig = extraNorm.map((p) => ({ ...p }));
  const todos = [...n.puntos.map((p) => ({ ...p })), ...extraNorm.map((p) => ({ ...p }))];
  const base = [...originales, ...extraOrig];

  // Pesos cacheados por región: se calculan una vez sobre las posiciones originales.
  const cachePesos = new Map();
  const pesosDe = (fn) => {
    if (cachePesos.has(fn)) return cachePesos.get(fn);
    const w = base.map((p) => Math.max(0, Math.min(1, fn(p))));
    cachePesos.set(fn, w);
    return w;
  };

  const aplicarAcciones = (acciones) => {
    for (const a of acciones) {
      if (a.tipo === 'asimetria') continue;  // se aplica al final
      const w = pesosDe(a.peso);
      for (let i = 0; i < todos.length; i++) {
        if (w[i] <= 0) continue;
        const destino = a.mapa(base[i]);
        todos[i].x += w[i] * (destino.x - base[i].x);
        todos[i].y += w[i] * (destino.y - base[i].y);
      }
    }
  };

  // Primero todo lo que cambia tamaños y posiciones.
  for (const { d, k } of plan) {
    if (d.medida.tipo === 'angulo') continue;
    aplicarAcciones(accionesDe(d, k, c, regs, medidas));
  }

  // Los ángulos se corrigen DESPUÉS y midiendo el resultado intermedio: estrechar un ojo
  // ya le cambia la inclinación por sí solo, así que girar además la desviación original
  // acababa duplicando el efecto.
  const planAngulos = plan.filter(({ d }) => d.medida.tipo === 'angulo');
  if (planAngulos.length) {
    const intermedio = {
      ...n, puntos: todos.slice(0, n.puntos.length), marco: n.marco,
    };
    const medidasInt = medir(intermedio);
    for (const { d, k } of planAngulos) {
      const objetivo = d.canon + d.desv * (1 + k);
      const actual = medidasInt[d.medida.id];
      const delta = objetivo - (Number.isFinite(actual) ? actual : d.valor);
      if (Math.abs(delta) < 1e-4) continue;
      aplicarAcciones(accionesDe(d, k, c, regs, medidas, delta));
    }
  }

  // Ajustes libres del dibujante.
  const libres = opciones.libres || {};
  const L = c.largoCara;
  if (libres.craneoAlto) {
    const f = 1 + libres.craneoAlto;
    const w = pesosDe(regs.craneo);
    const mapa = escalaY(f, c.yCeja);
    for (let i = 0; i < todos.length; i++) {
      if (w[i] <= 0) continue;
      const destino = mapa(base[i]);
      todos[i].y += w[i] * (destino.y - base[i].y);
    }
  }
  if (libres.cuello) {
    const w = pesosDe(regs.barbilla);
    const dy = -libres.cuello * 0.10 * L;
    for (let i = 0; i < todos.length; i++) todos[i].y += w[i] * dy;
  }

  // Asimetría al final, sobre el resultado acumulado.
  const asim = plan.map(({ d, k }) => ({ d, k })).find(({ d }) => d.medida.id === 'asimetria');
  if (asim) {
    const acciones = accionesDe(asim.d, asim.k, c, regs, medidas);
    const op = acciones.find((a) => a.tipo === 'asimetria');
    if (op) {
      const mapa = mapaEspejo({ puntos: todos.slice(0, n.puntos.length) });
      const copia = todos.map((p) => ({ ...p }));
      const f = Math.max(-1, Math.min(2, op.factor));
      for (let i = 0; i < n.puntos.length; i++) {
        const j = mapa[i];
        const dx = copia[i].x - (-copia[j].x);
        const dy = copia[i].y - copia[j].y;
        todos[i].x += dx * f * 0.5;
        todos[i].y += dy * f * 0.5;
      }
    }
  }

  const aImg = (p) => n.marco.aImagen(p);
  return {
    puntos: todos.slice(0, n.puntos.length).map(aImg),
    extra: todos.slice(n.puntos.length).map(aImg),
    normalizados: todos.slice(0, n.puntos.length),
    marco: n.marco,
    plan,
  };
}

/** Puntos auxiliares del contorno de la cabeza que la malla no cubre (cúpula del cráneo
 *  y orejas), estimados con el canon de Loomis. Sirven para que el warp arrastre también
 *  el pelo y los lados de la cabeza. */
export function puntosVirtuales(rostro, medidas) {
  const n = rostro.marco ? rostro : normalizar(rostro);
  const c = medidas._contexto && medidas._contexto.n === n ? medidas._contexto : contexto(n);
  // Loomis: la línea de los ojos parte la cabeza por la mitad ⇒ la coronilla está
  // tan arriba de los ojos como abajo está el mentón.
  const yCoronilla = -c.menton.y;
  const semiAncho = (medidas.anchoFrente || 3.6) / 2;
  const lista = [];
  for (let i = -3; i <= 3; i++) {
    const t = i / 3;
    lista.push({ x: t * semiAncho * 1.02, y: yCoronilla + (1 - Math.cos(t * Math.PI / 2)) * (c.yCeja - yCoronilla) * 0.9 });
  }
  // orejas: de la ceja a la base de la nariz, al borde del cráneo
  for (const signo of [-1, 1]) {
    for (const t of [0, 0.5, 1]) {
      lista.push({ x: signo * semiAncho * 1.12, y: c.yCeja + t * (c.subnasal.y - c.yCeja) });
    }
  }
  return lista.map((p) => n.marco.aImagen(p));
}
