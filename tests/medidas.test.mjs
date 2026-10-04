import { prueba, cerca, cierto, igual } from './prueba.mjs';
import { construirCanon, PROPORCIONES } from '../js/canon.js';
import { medir, canonLoomis, desviaciones, describir, canonPromedio, MEDIDAS } from '../js/medidas.js';
import { normalizar } from '../js/rostro.js';

const canon = () => construirCanon(400, 0, 0);

/** Copia un rostro aplicando una función a sus puntos. */
function deformar(rostro, fn) {
  return { ...rostro, puntos: rostro.puntos.map((p, i) => fn({ ...p }, i)) };
}

prueba('el canon cumple la regla de Loomis: los ojos a media altura', () => {
  const P = PROPORCIONES;
  cerca(P.yOjos, (P.yCoronilla + P.yMenton) / 2, 1e-9);
});

prueba('el canon cumple: base de la nariz a mitad de ceja–mentón', () => {
  const P = PROPORCIONES;
  cerca(P.ySubnasal, (P.yCeja + P.yMenton) / 2, 0.005);
});

prueba('el canon cumple: boca a un tercio de nariz–mentón', () => {
  const P = PROPORCIONES;
  cerca(P.yStomion, P.ySubnasal + (P.yMenton - P.ySubnasal) / 3, 0.005);
});

prueba('el canon cumple: ancho de cabeza = 2/3 de la altura', () => {
  cerca(PROPORCIONES.anchoMax, 0.68, 0.02);
});

prueba('el canon cumple: el rostro mide cinco anchos de ojo', () => {
  cerca(PROPORCIONES.anchoOjo * 5, PROPORCIONES.anchoMax, 0.06);
});

prueba('todas las medidas se calculan sobre el canon', () => {
  const m = medir(canon());
  for (const med of MEDIDAS) cierto(m[med.id] !== null, `${med.id} salió null`);
});

prueba('el canon no se desvía de sí mismo', () => {
  const ds = desviaciones(medir(canon()));
  igual(ds.length, MEDIDAS.length);
  for (const d of ds) cerca(d.magnitud, 0, 1e-9, d.medida.id);
});

prueba('las medidas no cambian con el tamaño de la foto', () => {
  const a = medir(construirCanon(400, 0, 0));
  const b = medir(construirCanon(1300, 250, -80));
  for (const med of MEDIDAS) cerca(b[med.id], a[med.id], 1e-6, med.id);
});

prueba('las medidas no cambian si la cabeza está inclinada', () => {
  const r = canon();
  const rad = 0.42, co = Math.cos(rad), si = Math.sin(rad);
  const girado = deformar(r, (p) => ({ x: p.x * co - p.y * si, y: p.x * si + p.y * co }));
  const a = medir(r), b = medir(girado);
  for (const med of MEDIDAS) cerca(b[med.id], a[med.id], 1e-6, med.id);
});

prueba('ensanchar la mandíbula se detecta como la desviación principal', () => {
  const r = canon();
  const n = normalizar(r);
  // ensancha un 25% los puntos de la mitad inferior, en coordenadas de imagen
  const yStomion = n.marco.aImagen({ x: 0, y: 1.59 }).y;
  const enOvalo = new Set(r.ovalo);
  const ancho = deformar(r, (p, i) => (enOvalo.has(i) && p.y > yStomion * 0.92 ? { x: p.x * 1.25, y: p.y } : p));
  const ds = desviaciones(medir(ancho));
  cierto(['anchoMandibula', 'anchoBarbilla'].includes(ds[0].medida.id),
    `la primera desviación fue ${ds[0].medida.id}`);
  cierto(ds[0].desv > 0.1, `desviación ${ds[0].desv}`);
});

prueba('una nariz más larga se mide como más larga y no afecta a la boca', () => {
  const r = canon();
  const refs = r.refs;
  const sub = r.puntos[refs.subnasal].y;
  const estirada = deformar(r, (p, i) => {
    if (i === refs.subnasal || i === refs.puntaNariz || i === refs.alarD || i === refs.alarI) {
      return { x: p.x, y: p.y + 0.04 * 400 };
    }
    return p;
  });
  const base = medir(r), nueva = medir(estirada);
  cierto(nueva.largoNariz > base.largoNariz * 1.1, 'la nariz no se midió más larga');
  cerca(nueva.anchoBoca, base.anchoBoca, 0.02, 'la boca cambió de ancho');
  cierto(sub > 0);
});

prueba('la asimetría del canon es cero y crece al desplazar un ojo', () => {
  const r = canon();
  cerca(medir(r).asimetria, 0, 1e-9);
  const torcido = deformar(r, (p, i) => (i === r.refs.pupilaD ? { x: p.x + 8, y: p.y - 5 } : p));
  cierto(medir(torcido).asimetria > 0.01);
});

prueba('el canon promedio de una lista es su media', () => {
  const a = medir(canon());
  const b = {};
  for (const m of MEDIDAS) b[m.id] = a[m.id] * 1.2;
  const p = canonPromedio([a, b]);
  for (const m of MEDIDAS) cerca(p[m.id], (a[m.id] + b[m.id]) / 2, 1e-9, m.id);
});

prueba('el canon promedio vacío cae en el de Loomis', () => {
  const p = canonPromedio([]);
  const c = canonLoomis();
  for (const m of MEDIDAS) cerca(p[m.id], c[m.id], 1e-12, m.id);
});

prueba('describir da porcentaje y nombre del rasgo', () => {
  const r = canon();
  const ancho = deformar(r, (p) => ({ x: p.x * 1.3, y: p.y }));
  const ds = desviaciones(medir(ancho));
  const d = ds.find((x) => x.medida.id === 'anchoBoca');
  const t = describir(d);
  cierto(t.rasgo === 'boca ancha', `rasgo: ${t.rasgo}`);
  cierto(/%/.test(t.detalle), t.detalle);
});
