// loomis.js — la construcción de la cabeza según Andrew Loomis, calculada sobre el
// rostro real (o sobre el ya exagerado).
//
// La idea de Loomis: la cabeza es una ESFERA a la que se le rebanan dos planos laterales
// (las sienes y mejillas), con la mandíbula colgando por delante. La esfera abarca de la
// coronilla a la base de la nariz y su diámetro es el ancho de la cabeza; sobre ella se
// dibuja la "cruz" —línea de cejas y línea media— que fija la inclinación. Después caen
// las divisiones: ojos a mitad de la cabeza, nariz a mitad de ceja-mentón, boca a un
// tercio de nariz-mentón, orejas de la ceja a la base de la nariz.
//
// La foto de frente no dice dónde está la coronilla (el pelo la tapa), así que se estima
// con la propia regla de Loomis: la línea de los ojos parte la cabeza por la mitad.

import { normalizar } from './rostro.js';
import { contexto } from './medidas.js';

const muestrear = (f, n, a = 0, b = Math.PI * 2) => {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(f(a + ((b - a) * i) / n));
  return pts;
};

/**
 * Devuelve los trazos de la construcción en coordenadas de IMAGEN.
 * @param {object} rostro  rostro (normal o exagerado)
 * @param {object} medidas medidas de ese mismo rostro
 * @param {object} o       {planos, divisiones, orejas, mandibula, cruz}
 */
export function construccion(rostro, medidas, o = {}) {
  const n = rostro.marco ? rostro : normalizar(rostro);
  const c = medidas._contexto && medidas._contexto.n === n ? medidas._contexto : contexto(n);
  const aImg = (p) => n.marco.aImagen(p);
  const trazos = [];
  const linea = (puntos, clase = 'guia', ancho = 1.6, cerrado = false) => trazos.push({
    puntos: puntos.map(aImg), clase, ancho, anchoFin: ancho, cerrado,
  });

  const yMenton = c.menton.y;
  const yCoronilla = -yMenton;               // los ojos a media altura (regla de Loomis)
  const ySubnasal = c.subnasal.y;
  const yCeja = c.yCeja;
  const yStomion = c.stomion.y;

  // La esfera del cráneo: va de la coronilla a la base de la nariz y, según Loomis, su
  // diámetro es el ancho de la cabeza. En una cabeza canónica las dos cosas coinciden;
  // en una real, no. Se dibuja entonces con el alto que marca la regla y el ancho que
  // tiene de verdad: lo que separa esa elipse de un círculo es, justamente, en cuánto
  // se aparta este cráneo del canon.
  const ry = (ySubnasal - yCoronilla) / 2;
  const rx = (medidas.anchoPomulos || ry * 2) / 2;
  const r = ry;                              // radio de referencia para los grosores
  const cy = yCoronilla + ry;
  const cx = 0;

  if (o.esfera !== false) {
    linea(muestrear((t) => ({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry }), 64), 'esfera', 1.8, true);
  }

  // Planos laterales: los círculos que Loomis rebana a los lados de la esfera; vistos de
  // frente se escorzan en elipses estrechas.
  if (o.planos !== false) {
    const dx = rx * 0.72;                    // a qué distancia del eje se rebana
    const escorzo = Math.sqrt(Math.max(0.0001, 1 - 0.72 ** 2));
    for (const signo of [-1, 1]) {
      linea(muestrear((t) => ({
        x: cx + signo * dx + Math.cos(t) * rx * escorzo * 0.55,
        y: cy + Math.sin(t) * ry * 0.80,
      }), 48), 'plano', 1.4, true);
    }
  }

  // La cruz: línea de las cejas y línea media, curvadas sobre la esfera.
  if (o.cruz !== false) {
    // arco de cejas: elipse achatada que sugiere el giro de la esfera
    const dy = (yCeja - cy) / ry;
    const semi = Math.sqrt(Math.max(0.01, 1 - dy * dy)) * rx;
    linea(muestrear((t) => ({ x: cx + Math.cos(t) * semi, y: yCeja + Math.sin(t) * semi * 0.16 }), 32, Math.PI, Math.PI * 2), 'cruz', 1.6);
    // línea media
    linea(muestrear((t) => ({ x: cx + Math.sin(t) * rx * 0.10, y: cy + Math.cos(t) * ry }), 32, Math.PI, Math.PI * 2), 'cruz', 1.6);
  }

  // Mandíbula: de los planos laterales al mentón.
  if (o.mandibula !== false) {
    const anchoMand = (medidas.anchoMandibula || r * 1.4) / 2;
    const anchoPom = (medidas.anchoPomulos || r * 1.8) / 2;
    linea([
      { x: -anchoPom, y: c.yMedioNariz },
      { x: -anchoMand, y: yStomion },
      { x: -anchoMand * 0.45, y: yMenton - (yMenton - yStomion) * 0.08 },
      { x: 0, y: yMenton },
      { x: anchoMand * 0.45, y: yMenton - (yMenton - yStomion) * 0.08 },
      { x: anchoMand, y: yStomion },
      { x: anchoPom, y: c.yMedioNariz },
    ], 'mandibula', 1.8);
  }

  // Divisiones horizontales con su etiqueta.
  if (o.divisiones !== false) {
    const semiEn = (y) => {
      const dy = (y - cy) / ry;
      const s = 1 - dy * dy;
      return s > 0 ? Math.sqrt(s) * rx : rx * 0.55;
    };
    const niveles = [
      [yCoronilla, 'coronilla'], [yCeja, 'cejas'], [0, 'ojos'],
      [ySubnasal, 'base nariz'], [yStomion, 'boca'], [yMenton, 'mentón'],
    ];
    for (const [y, etiqueta] of niveles) {
      const s = Math.max(semiEn(y), (medidas.anchoMandibula || r) / 2) * 1.06;
      trazos.push({
        puntos: [{ x: -s, y }, { x: s, y }].map(aImg),
        clase: 'division', ancho: 1.1, anchoFin: 1.1, etiqueta,
        anclaEtiqueta: aImg({ x: s + r * 0.06, y }),
      });
    }
    // los cinco anchos de ojo sobre la línea de los ojos
    const semiOjos = semiEn(0);
    for (let i = -2; i <= 2; i++) {
      const x = (i * semiOjos * 2) / 5;
      trazos.push({
        puntos: [{ x, y: -r * 0.06 }, { x, y: r * 0.06 }].map(aImg),
        clase: 'division', ancho: 1.1, anchoFin: 1.1,
      });
    }
  }

  // Orejas: de la ceja a la base de la nariz, al borde del cráneo.
  if (o.orejas !== false) {
    const xo = (medidas.anchoPomulos || r * 1.8) / 2;
    for (const signo of [-1, 1]) {
      linea(muestrear((t) => ({
        x: signo * (xo + Math.sin(t) * (ySubnasal - yCeja) * 0.34),
        y: (yCeja + ySubnasal) / 2 - Math.cos(t) * (ySubnasal - yCeja) / 2,
      }), 24, 0, Math.PI), 'oreja', 1.5);
    }
  }

  return trazos;
}

const COLOR = {
  esfera: 'rgba(40,90,170,0.85)',
  plano: 'rgba(40,90,170,0.45)',
  cruz: 'rgba(200,60,40,0.80)',
  mandibula: 'rgba(40,90,170,0.75)',
  division: 'rgba(60,60,60,0.45)',
  oreja: 'rgba(40,90,170,0.55)',
  guia: 'rgba(60,60,60,0.45)',
};

export function pintarConstruccion(ctx, trazos, o = {}) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const k = o.escala ?? 1;
  for (const t of trazos) {
    ctx.strokeStyle = o.color || COLOR[t.clase] || COLOR.guia;
    ctx.lineWidth = t.ancho * k;
    if (t.clase === 'division') ctx.setLineDash([5 * k, 5 * k]); else ctx.setLineDash([]);
    ctx.beginPath();
    t.puntos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (t.cerrado) ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (o.etiquetas !== false) {
    ctx.fillStyle = 'rgba(40,40,40,0.8)';
    ctx.font = `${Math.round(11 * k)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    for (const t of trazos) {
      if (t.etiqueta && t.anclaEtiqueta) ctx.fillText(t.etiqueta, t.anclaEtiqueta.x, t.anclaEtiqueta.y);
    }
  }
  ctx.restore();
}
