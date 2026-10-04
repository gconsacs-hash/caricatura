import { prueba, cerca, cierto, igual, finitos } from './prueba.mjs';
import { construirCanon } from '../js/canon.js';
import { medir, canonLoomis, desviaciones } from '../js/medidas.js';
import { exagerar, planExageracion, puntosVirtuales, regiones } from '../js/exagerar.js';
import { normalizar } from '../js/rostro.js';
import { contexto } from '../js/medidas.js';

const canon = () => construirCanon(400, 0, 0);
const deformar = (r, fn) => ({ ...r, puntos: r.puntos.map((p, i) => fn({ ...p }, i)) });

/** Rostro de prueba: canon con la mandíbula un 20% más ancha y la nariz un 15% más larga. */
function rostroDePrueba() {
  const r = canon();
  const enOvalo = new Set(r.ovalo);
  const refs = r.refs;
  const nariz = new Set([refs.subnasal, refs.puntaNariz, refs.alarD, refs.alarI]);
  return deformar(r, (p, i) => {
    let q = { ...p };
    if (enOvalo.has(i) && q.y > 290) q.x *= 1.20;
    if (nariz.has(i)) q.y += 0.03 * 400;
    return q;
  });
}

prueba('intensidad 0 deja el rostro intacto', () => {
  const r = canon();
  const m = medir(r);
  const res = exagerar(r, m, canonLoomis(), { intensidad: 0 });
  for (let i = 0; i < r.puntos.length; i++) {
    cerca(res.puntos[i].x, r.puntos[i].x, 1e-6);
    cerca(res.puntos[i].y, r.puntos[i].y, 1e-6);
  }
});

prueba('un rostro igual al canon no se deforma aunque la intensidad sea alta', () => {
  const r = canon();
  const m = medir(r);
  const res = exagerar(r, m, canonLoomis(), { intensidad: 3 });
  let maxDesplazamiento = 0;
  for (let i = 0; i < r.puntos.length; i++) {
    maxDesplazamiento = Math.max(maxDesplazamiento, Math.hypot(res.puntos[i].x - r.puntos[i].x, res.puntos[i].y - r.puntos[i].y));
  }
  cierto(maxDesplazamiento < 0.5, `se movió ${maxDesplazamiento.toFixed(2)} px`);
});

prueba('la desviación se multiplica por (1+k): k=1 duplica', () => {
  const r = rostroDePrueba();
  const m = medir(r);
  const antes = desviaciones(m).find((d) => d.medida.id === 'anchoMandibula');
  const res = exagerar(r, m, canonLoomis(), { intensidad: 1 });
  const despues = desviaciones(medir({ ...r, puntos: res.puntos }))
    .find((d) => d.medida.id === 'anchoMandibula');
  cerca(despues.relativa, antes.relativa * 2, Math.abs(antes.relativa) * 0.3,
    `antes ${antes.relativa.toFixed(3)} después ${despues.relativa.toFixed(3)}`);
});

prueba('la desviación amplificada conserva el signo (lo corto se hace más corto)', () => {
  const r = canon();
  // boca estrecha: 20% menos de ancho
  const refs = r.refs;
  const boca = new Set(r.grupos.boca);
  const estrecha = deformar(r, (p, i) => (boca.has(i) ? { x: p.x * 0.8, y: p.y } : p));
  const m = medir(estrecha);
  const antes = desviaciones(m).find((d) => d.medida.id === 'anchoBoca');
  cierto(antes.relativa < -0.1, `partía de ${antes.relativa}`);
  const res = exagerar(estrecha, m, canonLoomis(), { intensidad: 1.5 });
  const despues = desviaciones(medir({ ...estrecha, puntos: res.puntos }))
    .find((d) => d.medida.id === 'anchoBoca');
  cierto(despues.relativa < antes.relativa, `${despues.relativa} no es menor que ${antes.relativa}`);
  cierto(refs.comisuraD >= 0);
});

prueba('desactivar una medida frena su exageración', () => {
  // Las medidas no son del todo independientes: una barbilla más ancha también ensancha
  // algo la mandíbula, igual que en un dibujo de verdad. Lo que debe cumplirse es que
  // apagar la medida reduzca mucho su crecimiento, no que lo anule del todo.
  const r = rostroDePrueba();
  const m = medir(r);
  const antes = desviaciones(m).find((d) => d.medida.id === 'anchoMandibula').relativa;
  const medir2 = (res) => desviaciones(medir({ ...r, puntos: res.puntos }))
    .find((d) => d.medida.id === 'anchoMandibula').relativa;
  const conTodo = medir2(exagerar(r, m, canonLoomis(), { intensidad: 2 }));
  const apagada = medir2(exagerar(r, m, canonLoomis(), { intensidad: 2, porMedida: { anchoMandibula: 0 } }));
  cierto(conTodo > antes * 1.5, `con todo: ${antes.toFixed(3)} → ${conTodo.toFixed(3)}`);
  cierto(apagada - antes < (conTodo - antes) * 0.5,
    `apagada creció ${(apagada - antes).toFixed(3)} frente a ${(conTodo - antes).toFixed(3)}`);
});

prueba('el ángulo de los ojos llega al objetivo y no al doble', () => {
  // Al estrechar un ojo su inclinación ya aumenta sola; si además se gira la desviación
  // original, el efecto se duplica. La corrección se mide sobre el resultado intermedio.
  const r = canon();
  const refs = r.refs;
  const ojo = new Set([...r.grupos.ojoD, ...r.grupos.ojoI,
    refs.ojoDExt, refs.ojoDInt, refs.ojoIExt, refs.ojoIInt]);
  const centroY = r.puntos[refs.pupilaD].y;
  // ojos más estrechos y algo levantados
  const raro = deformar(r, (p, i) => {
    if (!ojo.has(i)) return p;
    const q = { x: p.x * 0.88, y: p.y };
    q.y += (Math.abs(p.x) / 400) * (p.y > centroY ? 6 : -6);
    return q;
  });
  const m = medir(raro);
  const antes = desviaciones(m).find((d) => d.medida.id === 'inclinacionOjos');
  const k = 1;
  const objetivo = antes.canon + antes.desv * (1 + k);
  const res = exagerar(raro, m, canonLoomis(), { intensidad: k });
  const despues = desviaciones(medir({ ...raro, puntos: res.puntos }))
    .find((d) => d.medida.id === 'inclinacionOjos');
  cerca(despues.valor, objetivo, 1.2,
    `objetivo ${objetivo.toFixed(2)}°, obtenido ${despues.valor.toFixed(2)}°`);
});

prueba('una intensidad bestial no hace desaparecer un rasgo', () => {
  const r = canon();
  const boca = new Set(r.grupos.boca);
  const yStomion = r.puntos[r.refs.stomion].y;
  // labios un 30% más finos de lo normal
  const finos = deformar(r, (p, i) => (boca.has(i) ? { x: p.x, y: yStomion + (p.y - yStomion) * 0.7 } : p));
  const m = medir(finos);
  const antes = desviaciones(m).find((d) => d.medida.id === 'grosorLabios');
  const res = exagerar(finos, m, canonLoomis(), { intensidad: 4 });
  const despues = desviaciones(medir({ ...finos, puntos: res.puntos }))
    .find((d) => d.medida.id === 'grosorLabios');
  cierto(despues.relativa < antes.relativa, 'no exageró nada');
  cierto(despues.relativa > -0.9, `los labios se quedaron en ${(despues.relativa * 100).toFixed(0)}% del canon`);
  cierto(despues.valor > 0.02, 'el rasgo se quedó en nada');
});

prueba('la exageración no mueve puntos a coordenadas imposibles', () => {
  const r = rostroDePrueba();
  const res = exagerar(r, medir(r), canonLoomis(), { intensidad: 2.5 });
  finitos(res.puntos);
  for (const p of res.puntos) cierto(Math.abs(p.x) < 5000 && Math.abs(p.y) < 5000);
});

prueba('el plan omite las medidas con multiplicador cero', () => {
  const r = rostroDePrueba();
  const m = medir(r);
  const todo = planExageracion(m, canonLoomis(), { intensidad: 1 });
  const menos = planExageracion(m, canonLoomis(), { intensidad: 1, porMedida: { anchoBoca: 0, anchoNariz: 0 } });
  igual(menos.length, todo.length - 2);
});

prueba('el plan está ordenado de lo estructural a lo pequeño', () => {
  const r = rostroDePrueba();
  const plan = planExageracion(medir(r), canonLoomis(), { intensidad: 1 });
  const ids = plan.map((p) => p.d.medida.id);
  cierto(ids.indexOf('anchoFrente') < ids.indexOf('anchoBoca'));
  cierto(ids[ids.length - 1] === 'asimetria');
});

prueba('las regiones valen 1 en su centro y 0 lejos', () => {
  const r = canon();
  const n = normalizar(r);
  const m = medir(r);
  const regs = regiones(contexto(n), m);
  const pupila = n.puntos[n.refs.pupilaD];
  cerca(regs.ojoD(pupila), 1, 1e-9);
  cierto(regs.ojoD({ x: pupila.x, y: pupila.y + 4 }) === 0);
  cerca(regs.barbilla(n.puntos[n.refs.menton]), 1, 1e-9);
  cierto(regs.barbilla(n.puntos[n.refs.nasion]) === 0);
  cerca(regs.todo({ x: 99, y: 99 }), 1, 1e-12);
});

prueba('el alto del cráneo es un ajuste libre que estira hacia arriba', () => {
  const r = canon();
  const m = medir(r);
  const res = exagerar(r, m, canonLoomis(), { intensidad: 0, libres: { craneoAlto: 0.4 } });
  const n = normalizar(r);
  // la coronilla (primer punto del óvalo) debe subir; el mentón no se mueve
  const coronillaAntes = r.puntos[r.ovalo[0]];
  const coronillaDespues = res.puntos[r.ovalo[0]];
  cierto(coronillaDespues.y < coronillaAntes.y - 5, `subió ${coronillaAntes.y - coronillaDespues.y}`);
  const mentonAntes = r.puntos[r.refs.menton], mentonDespues = res.puntos[r.refs.menton];
  cerca(mentonDespues.y, mentonAntes.y, 1.0);
  cierto(n.puntos.length === r.puntos.length);
});

prueba('los puntos virtuales rodean la cabeza por encima de las cejas', () => {
  const r = canon();
  const m = medir(r);
  const v = puntosVirtuales(r, m);
  cierto(v.length >= 10);
  finitos(v);
  const n = normalizar(r);
  const enNormal = v.map((p) => n.marco.aNormal(p));
  const cejaY = contexto(n).yCeja;
  const arriba = enNormal.filter((p) => p.y < cejaY);
  cierto(arriba.length >= 5, `solo ${arriba.length} puntos por encima de la ceja`);
});

prueba('los puntos virtuales se exageran junto al rostro', () => {
  const r = canon();
  const m = medir(r);
  const v = puntosVirtuales(r, m);
  const res = exagerar(r, m, canonLoomis(), { intensidad: 0, libres: { craneoAlto: 0.5 } }, v);
  igual(res.extra.length, v.length);
  const subieron = res.extra.filter((p, i) => p.y < v[i].y - 2).length;
  cierto(subieron >= 5, `solo ${subieron} puntos virtuales subieron`);
});
