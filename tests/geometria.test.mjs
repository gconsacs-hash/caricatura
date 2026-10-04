import { prueba, cerca, cierto, igual, finitos } from './prueba.mjs';
import { tamanoCentroide, centroide, anchoPoligonoEn, marco, suavizar, chaikin, ruido } from '../js/geometria.js';

const cuadrado = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];

prueba('centroide de un cuadrado centrado es el origen', () => {
  const c = centroide(cuadrado);
  cerca(c.x, 0, 1e-12); cerca(c.y, 0, 1e-12);
});

prueba('tamaño de centroide del cuadrado unidad es √2', () => {
  cerca(tamanoCentroide(cuadrado), Math.SQRT2, 1e-12);
});

prueba('tamaño de centroide escala linealmente', () => {
  const grande = cuadrado.map((p) => ({ x: p.x * 3, y: p.y * 3 }));
  cerca(tamanoCentroide(grande), Math.SQRT2 * 3, 1e-12);
});

prueba('ancho de polígono a media altura', () => {
  const r = anchoPoligonoEn(cuadrado, 0);
  cerca(r.ancho, 2, 1e-12);
  cerca(r.izq, -1, 1e-12);
});

prueba('ancho de polígono fuera del rango devuelve null', () => {
  igual(anchoPoligonoEn(cuadrado, 5), null);
});

prueba('ancho de polígono sigue un triángulo', () => {
  const tri = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: -1, y: 2 }];
  cerca(anchoPoligonoEn(tri, 1).ancho, 1, 1e-12);
});

prueba('el marco normalizado va y vuelve', () => {
  const m = marco({ centro: { x: 100, y: 50 }, rad: 0.3, escala: 20 });
  const p = { x: 137, y: 71 };
  const ida = m.aNormal(p);
  const vuelta = m.aImagen(ida);
  cerca(vuelta.x, p.x, 1e-9); cerca(vuelta.y, p.y, 1e-9);
});

prueba('el marco cancela la inclinación de la cabeza', () => {
  // dos pupilas inclinadas 20° quedan horizontales en el marco
  const rad = 0.349;
  const m = marco({ centro: { x: 0, y: 0 }, rad, escala: 1 });
  const pd = { x: Math.cos(rad) * 30, y: Math.sin(rad) * 30 };
  const n = m.aNormal(pd);
  cerca(n.y, 0, 1e-9);
  cerca(n.x, 30, 1e-9);
});

prueba('suavizar está acotado y es monótono', () => {
  igual(suavizar(-1), 0); igual(suavizar(2), 1);
  cerca(suavizar(0.5), 0.5, 1e-12);
  cierto(suavizar(0.3) < suavizar(0.7));
});

prueba('chaikin densifica sin salirse de la caja', () => {
  const s = chaikin(cuadrado, 2, true);
  cierto(s.length > cuadrado.length);
  for (const p of s) cierto(Math.abs(p.x) <= 1.001 && Math.abs(p.y) <= 1.001);
  finitos(s);
});

prueba('el ruido es determinista y acotado', () => {
  igual(ruido(5, 2), ruido(5, 2));
  for (let i = 0; i < 50; i++) cierto(Math.abs(ruido(i, 1)) <= 1);
});
