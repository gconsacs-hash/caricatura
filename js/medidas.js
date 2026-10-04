// medidas.js — qué se mide en un rostro y cuánto se desvía del canon.
//
// Esta es la parte que convierte el método de John Kascht en algo calculable. Kascht no
// agranda la nariz porque "las caricaturas tienen narices grandes": mide (a ojo) en qué
// se aparta ese rostro del rostro promedio, y empuja justamente eso. Aquí se hace igual:
//   1. se mide el rostro en el marco normalizado (sin tamaño, sin inclinación);
//   2. se mide el rostro del canon con las mismas funciones;
//   3. la desviación es la diferencia entre ambos;
//   4. exagerar = multiplicar la desviación, no la medida.
// Así un mentón pequeño se hace más pequeño todavía, que es lo que la caricatura pide.

import { construirCanon } from './canon.js';
import { normalizar, anchoEn } from './rostro.js';
import { distancia, centroide } from './geometria.js';

/** Accesos cómodos a un rostro ya normalizado. */
export function contexto(n) {
  const P = (nombre) => n.puntos[n.refs[nombre]];
  const yCeja = centroide([...n.grupos.cejaI, ...n.grupos.cejaD].map((i) => n.puntos[i])).y;
  const yOjos = (P('pupilaI').y + P('pupilaD').y) / 2;
  const menton = P('menton'), stomion = P('stomion');
  const nasion = P('nasion'), subnasal = P('subnasal');
  return {
    n, P, yCeja, yOjos,
    largoCara: menton.y - yCeja,
    yMedioNariz: (nasion.y + subnasal.y) / 2,
    yMentonMedio: (stomion.y + menton.y) / 2,
    menton, stomion, nasion, subnasal,
  };
}

const grados = (rad) => (rad * 180) / Math.PI;

/** Inclinación de un par de puntos (interno → externo) en grados.
 *  Positivo = el externo queda más alto (ojo "levantado"). */
function inclinacion(interno, externo) {
  const dx = Math.abs(externo.x - interno.x);
  const dy = interno.y - externo.y;
  return grados(Math.atan2(dy, dx));
}

/** Asimetría: desajuste medio entre cada punto de referencia y su pareja del otro lado.
 *  Los puntos de la línea media cuentan por su desplazamiento lateral. */
function asimetria(c) {
  const pares = [['pupilaI', 'pupilaD'], ['ojoIExt', 'ojoDExt'], ['ojoIInt', 'ojoDInt'],
    ['alarI', 'alarD'], ['comisuraI', 'comisuraD']];
  const medios = ['nasion', 'puntaNariz', 'subnasal', 'stomion', 'menton'];
  let s = 0, cuenta = 0;
  for (const [a, b] of pares) {
    const A = c.P(a), B = c.P(b);
    s += ((A.x + B.x) / 2) ** 2 + (A.y - B.y) ** 2;
    cuenta++;
  }
  for (const m of medios) { s += c.P(m).x ** 2; cuenta++; }
  return Math.sqrt(s / cuenta);
}

/**
 * Catálogo de medidas.
 *
 * `tipo` decide cómo se exagera:
 *   escala   → la medida se multiplica (anchos, largos)
 *   angulo   → se suman grados
 *   absoluto → se suma la diferencia tal cual
 *
 * `sd` es cuánto varía esa medida entre personas normales: un 6% de diferencia en el
 * ancho de los pómulos llama mucho más la atención que un 6% en el grosor de los labios.
 * Dividir por `sd` pone todas las desviaciones en la misma escala, y es lo que decide
 * qué rasgos encabezan la lista de "lo que define este rostro".
 *
 * `op` describe la deformación geométrica que realiza el cambio (ver exagerar.js).
 */
export const MEDIDAS = [
  {
    // Se mide justo encima de la ceja: más arriba el pelo tapa la silueta y la malla
    // ya no da información fiable.
    id: 'anchoFrente', etiqueta: 'Ancho de la frente', zona: 'cráneo', tipo: 'escala', sd: 0.06,
    calcular: (c) => anchoEn(c.n, c.yCeja - 0.06 * c.largoCara),
    mas: 'frente ancha', menos: 'frente estrecha',
    op: { tipo: 'escalaX', region: 'craneo', anclaX: 0 },
  },
  {
    id: 'anchoPomulos', etiqueta: 'Ancho de pómulos', zona: 'cráneo', tipo: 'escala', sd: 0.06,
    calcular: (c) => anchoEn(c.n, c.yMedioNariz),
    mas: 'pómulos salientes', menos: 'pómulos hundidos',
    op: { tipo: 'escalaX', region: 'pomulos', anclaX: 0 },
  },
  {
    id: 'anchoMandibula', etiqueta: 'Ancho de mandíbula', zona: 'mandíbula', tipo: 'escala', sd: 0.08,
    calcular: (c) => anchoEn(c.n, c.stomion.y),
    mas: 'mandíbula ancha', menos: 'mandíbula estrecha',
    op: { tipo: 'escalaX', region: 'mandibula', anclaX: 0 },
  },
  {
    id: 'anchoBarbilla', etiqueta: 'Ancho de la barbilla', zona: 'mandíbula', tipo: 'escala', sd: 0.10,
    calcular: (c) => anchoEn(c.n, c.yMentonMedio),
    mas: 'barbilla cuadrada', menos: 'barbilla en punta',
    op: { tipo: 'escalaX', region: 'barbilla', anclaX: 0 },
  },
  {
    id: 'largoCara', etiqueta: 'Largo del rostro', zona: 'proporción', tipo: 'escala', sd: 0.07,
    calcular: (c) => c.largoCara,
    mas: 'rostro alargado', menos: 'rostro corto',
    op: { tipo: 'escalaY', region: 'bajoCeja', anclaY: 'yCeja' },
  },
  {
    id: 'largoBarbilla', etiqueta: 'Largo de la barbilla', zona: 'mandíbula', tipo: 'escala', sd: 0.11,
    calcular: (c) => c.menton.y - c.stomion.y,
    mas: 'barbilla larga', menos: 'barbilla corta',
    op: { tipo: 'escalaY', region: 'bajoBoca', anclaY: 'yStomion' },
  },
  {
    id: 'separacionOjos', etiqueta: 'Separación de los ojos', zona: 'ojos', tipo: 'escala', sd: 0.06,
    calcular: (c) => distancia(c.P('pupilaI'), c.P('pupilaD')),
    mas: 'ojos separados', menos: 'ojos juntos',
    op: { tipo: 'separarOjos' },
  },
  {
    id: 'anchoOjos', etiqueta: 'Ancho de los ojos', zona: 'ojos', tipo: 'escala', sd: 0.07,
    calcular: (c) => (distancia(c.P('ojoIExt'), c.P('ojoIInt')) + distancia(c.P('ojoDExt'), c.P('ojoDInt'))) / 2,
    mas: 'ojos largos', menos: 'ojos cortos',
    op: { tipo: 'escalaXOjos' },
  },
  {
    id: 'alturaOjos', etiqueta: 'Apertura de los ojos', zona: 'ojos', tipo: 'escala', sd: 0.13,
    calcular: (c) => (distancia(c.P('ojoISup'), c.P('ojoIInf')) + distancia(c.P('ojoDSup'), c.P('ojoDInf'))) / 2,
    mas: 'ojos muy abiertos', menos: 'ojos entornados',
    op: { tipo: 'escalaYOjos' },
  },
  {
    id: 'inclinacionOjos', etiqueta: 'Inclinación de los ojos', zona: 'ojos', tipo: 'angulo', sd: 3.0,
    calcular: (c) => (inclinacion(c.P('ojoIInt'), c.P('ojoIExt')) + inclinacion(c.P('ojoDInt'), c.P('ojoDExt'))) / 2,
    mas: 'ojos levantados', menos: 'ojos caídos',
    op: { tipo: 'rotarOjos' },
  },
  {
    id: 'alturaCejas', etiqueta: 'Altura de las cejas', zona: 'cejas', tipo: 'escala', sd: 0.12,
    calcular: (c) => c.yOjos - c.yCeja,
    mas: 'cejas altas', menos: 'cejas pegadas al ojo',
    op: { tipo: 'subirCejas' },
  },
  {
    id: 'inclinacionCejas', etiqueta: 'Inclinación de las cejas', zona: 'cejas', tipo: 'angulo', sd: 4.0,
    calcular: (c) => {
      // el extremo interno es el de menor |x|, el externo el de mayor |x|
      const puntas = (idx) => {
        const g = idx.map((i) => c.n.puntos[i]);
        let interno = g[0], externo = g[0];
        for (const p of g) {
          if (Math.abs(p.x) < Math.abs(interno.x)) interno = p;
          if (Math.abs(p.x) > Math.abs(externo.x)) externo = p;
        }
        return [interno, externo];
      };
      const [iI, eI] = puntas(c.n.grupos.cejaI);
      const [iD, eD] = puntas(c.n.grupos.cejaD);
      return (inclinacion(iI, eI) + inclinacion(iD, eD)) / 2;
    },
    mas: 'cejas arqueadas hacia arriba', menos: 'cejas caídas',
    op: { tipo: 'rotarCejas' },
  },
  {
    id: 'largoNariz', etiqueta: 'Largo de la nariz', zona: 'nariz', tipo: 'escala', sd: 0.08,
    calcular: (c) => c.subnasal.y - c.nasion.y,
    mas: 'nariz larga', menos: 'nariz corta',
    op: { tipo: 'escalaY', region: 'nariz', anclaY: 'yNasion' },
  },
  {
    id: 'anchoNariz', etiqueta: 'Ancho de la nariz', zona: 'nariz', tipo: 'escala', sd: 0.08,
    calcular: (c) => distancia(c.P('alarI'), c.P('alarD')),
    mas: 'nariz ancha', menos: 'nariz fina',
    op: { tipo: 'escalaX', region: 'nariz', anclaX: 0 },
  },
  {
    id: 'anchoBoca', etiqueta: 'Ancho de la boca', zona: 'boca', tipo: 'escala', sd: 0.08,
    calcular: (c) => distancia(c.P('comisuraI'), c.P('comisuraD')),
    mas: 'boca ancha', menos: 'boca pequeña',
    op: { tipo: 'escalaX', region: 'boca', anclaX: 0 },
  },
  {
    id: 'grosorLabios', etiqueta: 'Grosor de los labios', zona: 'boca', tipo: 'escala', sd: 0.17,
    calcular: (c) => Math.abs(c.P('labioInf').y - c.P('labioSup').y),
    mas: 'labios gruesos', menos: 'labios finos',
    op: { tipo: 'escalaY', region: 'boca', anclaY: 'yStomion' },
  },
  {
    id: 'alturaBoca', etiqueta: 'Distancia nariz-boca', zona: 'boca', tipo: 'escala', sd: 0.12,
    calcular: (c) => c.stomion.y - c.subnasal.y,
    mas: 'boca baja, labio largo', menos: 'boca pegada a la nariz',
    op: { tipo: 'bajarBoca' },
  },
  {
    id: 'asimetria', etiqueta: 'Asimetría', zona: 'conjunto', tipo: 'absoluto', sd: 0.02,
    calcular: (c) => asimetria(c),
    mas: 'rostro asimétrico', menos: 'rostro simétrico',
    op: { tipo: 'asimetria' },
  },
];

/** Mide un rostro (en coordenadas de imagen). Devuelve {id: valor}. */
export function medir(rostro) {
  const n = rostro.marco ? rostro : normalizar(rostro);
  const c = contexto(n);
  const salida = { _contexto: c };
  for (const m of MEDIDAS) {
    const v = m.calcular(c);
    salida[m.id] = (v === null || !Number.isFinite(v)) ? null : v;
  }
  return salida;
}

let canonCache = null;
/** Medidas del rostro del canon de Loomis. Son la referencia por omisión. */
export function canonLoomis() {
  if (!canonCache) {
    const r = construirCanon(400, 0, 0);
    const m = medir(r);
    canonCache = {};
    for (const med of MEDIDAS) canonCache[med.id] = m[med.id];
  }
  return canonCache;
}

/** Canon promediado a partir de rostros ya analizados (el "ojo entrenado"). */
export function canonPromedio(listaDeMedidas) {
  if (!listaDeMedidas || listaDeMedidas.length === 0) return canonLoomis();
  const salida = {};
  for (const m of MEDIDAS) {
    const vals = listaDeMedidas.map((x) => x[m.id]).filter((x) => typeof x === 'number' && Number.isFinite(x));
    salida[m.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : canonLoomis()[m.id];
  }
  return salida;
}

/** Compara las medidas con el canon y ordena por cuánto se apartan.
 *  `desv` es la desviación en las unidades de la medida; `magnitud` es esa desviación
 *  dividida por lo que varía normalmente, y sirve para ordenar. */
export function desviaciones(medidas, canon = canonLoomis()) {
  const lista = [];
  for (const m of MEDIDAS) {
    const v = medidas[m.id], c = canon[m.id];
    if (v === null || c === null || !Number.isFinite(v) || !Number.isFinite(c)) continue;
    let desv, relativa;
    if (m.tipo === 'escala') {
      relativa = c !== 0 ? v / c - 1 : 0;
      desv = relativa;
    } else {
      desv = v - c;
      relativa = desv;
    }
    lista.push({ medida: m, valor: v, canon: c, desv, relativa, magnitud: Math.abs(desv) / m.sd });
  }
  lista.sort((a, b) => b.magnitud - a.magnitud);
  return lista;
}

/** Frase legible de una desviación, al modo de las anotaciones de Kascht. */
export function describir(d) {
  const m = d.medida;
  const signo = d.desv >= 0;
  const rasgo = signo ? m.mas : m.menos;
  if (m.tipo === 'escala') {
    const pct = Math.round(Math.abs(d.relativa) * 100);
    return { rasgo, detalle: `${pct}% ${signo ? 'más' : 'menos'} que el canon` };
  }
  if (m.tipo === 'angulo') {
    return { rasgo, detalle: `${Math.abs(d.desv).toFixed(1)}° ${signo ? 'por encima' : 'por debajo'} del canon` };
  }
  return { rasgo, detalle: `${(d.valor * 100).toFixed(1)} centésimas de desajuste` };
}
