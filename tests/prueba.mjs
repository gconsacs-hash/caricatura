// Arnés de pruebas mínimo, sin dependencias.
const pruebas = [];
export function prueba(nombre, fn) { pruebas.push({ nombre, fn }); }

export function igual(a, b, mensaje = '') {
  if (a !== b) throw new Error(`${mensaje} esperado ${b}, obtenido ${a}`);
}
export function cerca(a, b, tol = 1e-6, mensaje = '') {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${mensaje} esperado ${b} ±${tol}, obtenido ${a}`);
}
export function cierto(v, mensaje = '') {
  if (!v) throw new Error(mensaje || 'se esperaba verdadero');
}
export function finitos(puntos, mensaje = '') {
  for (const p of puntos) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`${mensaje} punto no finito: ${JSON.stringify(p)}`);
  }
}

export async function correr(archivos) {
  for (const a of archivos) await import(a);
  let ok = 0;
  const fallos = [];
  for (const p of pruebas) {
    try { await p.fn(); ok++; }
    catch (e) { fallos.push({ nombre: p.nombre, error: e }); }
  }
  console.log(`\n${ok}/${pruebas.length} pruebas superadas`);
  for (const f of fallos) console.log(`  ✗ ${f.nombre}\n      ${f.error.message}`);
  if (fallos.length) process.exitCode = 1;
  else console.log('todo en orden');
}
