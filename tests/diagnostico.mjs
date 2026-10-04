import { construirCanon } from '../js/canon.js';
import { normalizar, anchoEn } from '../js/rostro.js';
import { medir, canonLoomis, contexto, MEDIDAS } from '../js/medidas.js';

const r = construirCanon(400, 0, 0);
const n = normalizar(r);
const c = contexto(n);
console.log('escala (px) =', n.marco.escala.toFixed(2), ' → en alturas de cabeza:', (n.marco.escala / 400).toFixed(4));
const H = (y) => (0.5 + y * n.marco.escala / 400).toFixed(3);  // altura en unidades de cabeza
console.log('y normalizado → altura de cabeza');
for (const [k, y] of [['ojos', 0], ['ceja', c.yCeja], ['nasion', c.nasion.y], ['subnasal', c.subnasal.y],
  ['stomion', c.stomion.y], ['menton', c.menton.y], ['coronilla(est)', -c.menton.y]]) {
  console.log(`  ${k.padEnd(14)} y=${y.toFixed(3).padStart(7)}   cabeza=${H(y)}`);
}
console.log('largoCara =', c.largoCara.toFixed(3));
console.log('\nbandas de ancho:');
for (const [k, y] of [
  ['craneo 0.45L', c.yCeja - 0.45 * c.largoCara],
  ['craneo 0.12L', c.yCeja - 0.12 * c.largoCara],
  ['craneo 0.06L', c.yCeja - 0.06 * c.largoCara],
  ['pomulos', c.yMedioNariz],
  ['mandibula', c.stomion.y],
  ['barbilla', c.yMentonMedio]]) {
  const a = anchoEn(n, y);
  console.log(`  ${k.padEnd(14)} y=${y.toFixed(3).padStart(7)} cabeza=${H(y)} ancho=${a === null ? 'FUERA DEL ÓVALO' : a.toFixed(3)}`);
}
console.log('\nmedidas del canon:');
const m = medir(r);
for (const med of MEDIDAS) console.log(`  ${med.id.padEnd(18)} ${m[med.id] === null ? 'null' : m[med.id].toFixed(4)}`);
