import { prueba, cerca, cierto, igual } from './prueba.mjs';
import { deformacion, campo, muestra, deformarImagen, controlesDesdeMalla } from '../js/mls.js';
import { construirCanon } from '../js/canon.js';

const rejilla = [];
for (let y = 0; y <= 100; y += 25) for (let x = 0; x <= 100; x += 25) rejilla.push({ x, y });

prueba('sin movimiento de los controles, la deformación es la identidad', () => {
  const f = deformacion(rejilla, rejilla);
  for (const p of [{ x: 13, y: 61 }, { x: 99, y: 2 }, { x: 50, y: 50 }]) {
    const r = f(p.x, p.y);
    cerca(r.x, p.x, 1e-6); cerca(r.y, p.y, 1e-6);
  }
});

prueba('una traslación global de los controles traslada todo el plano', () => {
  const destino = rejilla.map((p) => ({ x: p.x + 17, y: p.y - 9 }));
  const f = deformacion(rejilla, destino);
  const r = f(33, 44);
  cerca(r.x, 33 + 17, 1e-6); cerca(r.y, 44 - 9, 1e-6);
});

prueba('una semejanza global se reproduce exactamente', () => {
  const k = 1.7, ang = 0.4, co = Math.cos(ang), si = Math.sin(ang);
  const T = (p) => ({ x: (p.x * co - p.y * si) * k + 30, y: (p.x * si + p.y * co) * k - 12 });
  const f = deformacion(rejilla, rejilla.map(T));
  for (const p of [{ x: 10, y: 80 }, { x: 70, y: 20 }]) {
    const esperado = T(p), r = f(p.x, p.y);
    cerca(r.x, esperado.x, 1e-5); cerca(r.y, esperado.y, 1e-5);
  }
});

prueba('los puntos de control caen exactamente en su destino', () => {
  const destino = rejilla.map((p, i) => ({ x: p.x + (i % 3) * 4, y: p.y - (i % 5) * 3 }));
  const f = deformacion(rejilla, destino);
  for (let i = 0; i < rejilla.length; i++) {
    const r = f(rejilla[i].x, rejilla[i].y);
    cerca(r.x, destino[i].x, 1e-4, `control ${i}`);
    cerca(r.y, destino[i].y, 1e-4, `control ${i}`);
  }
});

prueba('la deformación es suave: puntos vecinos van a destinos vecinos', () => {
  const destino = rejilla.map((p, i) => ({ x: p.x + (i === 12 ? 20 : 0), y: p.y }));
  const f = deformacion(rejilla, destino);
  const a = f(40, 40), b = f(41, 40);
  cierto(Math.hypot(a.x - b.x, a.y - b.y) < 4, 'salto brusco en la deformación');
});

prueba('el campo interpola exactamente una función lineal', () => {
  const c = campo(100, 100, 10, (x, y) => ({ x: 2 * x + 3, y: -y + 7 }));
  const m = muestra(c, 33, 48);
  cerca(m.x, 2 * 33 + 3, 1e-3);
  cerca(m.y, -48 + 7, 1e-3);
});

prueba('el campo se sujeta en los bordes', () => {
  const c = campo(50, 50, 10, (x, y) => ({ x, y }));
  const m = muestra(c, -20, 999);
  cerca(m.x, 0, 1e-6);
  cerca(m.y, 50, 1e-6);
});

// --- imagen ---
const crearImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });

function imagenDePrueba(W, H) {
  const img = crearImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = (x < W / 2) ? 220 : 40;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  return img;
}

prueba('deformar sin cambios devuelve la misma imagen', () => {
  const img = imagenDePrueba(40, 40);
  const controles = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 10, y: 30 }, { x: 30, y: 30 }];
  const salida = deformarImagen(img, controles, controles, crearImageData, { paso: 4 });
  let maxDif = 0;
  for (let i = 0; i < img.data.length; i += 4) maxDif = Math.max(maxDif, Math.abs(img.data[i] - salida.data[i]));
  cierto(maxDif <= 2, `diferencia máxima ${maxDif}`);
});

prueba('deformar mueve el borde de la imagen', () => {
  const W = 60, H = 60;
  const img = imagenDePrueba(W, H);
  const origen = [{ x: 30, y: 30 }, { x: 20, y: 20 }, { x: 40, y: 40 }];
  const destino = [{ x: 42, y: 30 }, { x: 32, y: 20 }, { x: 52, y: 40 }];
  const salida = deformarImagen(img, origen, destino, crearImageData, { paso: 3 });
  // el borde claro/oscuro estaba en x=30; al desplazar los controles +12 debe correrse
  const fila = 30;
  const bordeEn = (datos) => {
    for (let x = 1; x < W; x++) {
      const a = datos[(fila * W + x - 1) * 4], b = datos[(fila * W + x) * 4];
      if (a - b > 80) return x;
    }
    return -1;
  };
  const antes = bordeEn(img.data), despues = bordeEn(salida.data);
  cierto(despues > antes + 3, `el borde pasó de ${antes} a ${despues}`);
});

prueba('deformar no deja píxeles transparentes ni NaN', () => {
  const img = imagenDePrueba(30, 30);
  const origen = [{ x: 15, y: 15 }, { x: 5, y: 5 }];
  const destino = [{ x: 9, y: 19 }, { x: 5, y: 5 }];
  const salida = deformarImagen(img, origen, destino, crearImageData, { paso: 3 });
  for (let i = 0; i < salida.data.length; i += 4) {
    cierto(Number.isFinite(salida.data[i]), 'píxel NaN');
    igual(salida.data[i + 3], 255);
  }
});

prueba('los controles de la malla incluyen la silueta y los rasgos', () => {
  const r = construirCanon(400, 0, 0);
  const exagerados = r.puntos.map((p) => ({ x: p.x * 1.1, y: p.y }));
  const { origen, destino } = controlesDesdeMalla(r, exagerados);
  igual(origen.length, destino.length);
  cierto(origen.length >= r.ovalo.length);
  cierto(origen.length <= r.puntos.length);
});
