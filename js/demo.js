// demo.js — un rostro dibujado a mano con código, para poder probar la app sin subir
// ninguna foto. Viene con sus puntos ya marcados, así que entra por el modo manual y
// recorre exactamente el mismo camino que una foto real.

// A propósito NO es el canon: mandíbula ancha, barbilla corta, nariz larga, ojos juntos
// y pequeños, cejas bajas. Si el dibujo de prueba fuese proporcionado, la app no tendría
// nada que exagerar y no se vería para qué sirve.
const P = {
  // en unidades de la altura de la cabeza, con la coronilla en y=0
  anchoCabeza: 0.66, yCeja: 0.42, yOjos: 0.50, ySubnasal: 0.745, yStomion: 0.845,
  xPupila: 0.108, semiOjo: 0.050, altoOjo: 0.024,
  semiAlar: 0.088, semiBoca: 0.088,
};

export function dibujarRostroDePrueba(lado = 760) {
  const c = document.createElement('canvas');
  c.width = lado; c.height = lado;
  const x = c.getContext('2d');
  const H = lado * 0.78;                 // altura de la cabeza en píxeles
  const cx = lado / 2, top = lado * 0.11;
  const u = (v) => v * H;                // de alturas de cabeza a píxeles
  const px = (dx, dy) => ({ x: cx + u(dx), y: top + u(dy) });

  x.fillStyle = '#20242b';
  x.fillRect(0, 0, lado, lado);

  // --- cabeza: óvalo con un degradado que sugiere la luz por la izquierda ---
  const grad = x.createLinearGradient(cx - u(0.34), top, cx + u(0.34), top + u(1));
  grad.addColorStop(0, '#f0d9c3');
  grad.addColorStop(0.55, '#d9bfa6');
  grad.addColorStop(1, '#9d8370');
  x.fillStyle = grad;
  x.beginPath();
  x.ellipse(cx, top + u(0.52), u(0.34), u(0.52), 0, 0, Math.PI * 2);
  x.fill();

  // mandíbula ancha y cuadrada: el rasgo que el análisis debe encontrar primero
  x.beginPath();
  x.moveTo(cx - u(0.335), top + u(0.58));
  x.quadraticCurveTo(cx - u(0.335), top + u(0.90), cx - u(0.17), top + u(0.985));
  x.quadraticCurveTo(cx, top + u(1.015), cx + u(0.17), top + u(0.985));
  x.quadraticCurveTo(cx + u(0.335), top + u(0.90), cx + u(0.335), top + u(0.58));
  x.closePath();
  x.fill();

  // --- pelo ---
  x.fillStyle = '#3a2d26';
  x.beginPath();
  x.ellipse(cx, top + u(0.20), u(0.345), u(0.235), 0, Math.PI, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(cx - u(0.345), top + u(0.20));
  x.quadraticCurveTo(cx - u(0.30), top + u(0.30), cx - u(0.20), top + u(0.26));
  x.quadraticCurveTo(cx, top + u(0.33), cx + u(0.20), top + u(0.26));
  x.quadraticCurveTo(cx + u(0.30), top + u(0.30), cx + u(0.345), top + u(0.20));
  x.closePath();
  x.fill();

  // --- sombras del volumen: pómulos, lados de la nariz, hueco de los ojos ---
  const sombra = (sx, sy, rx, ry, a, alfa) => {
    x.save();
    x.globalAlpha = alfa;
    x.fillStyle = '#8a6f5c';
    x.beginPath();
    x.ellipse(cx + u(sx), top + u(sy), u(rx), u(ry), a, 0, Math.PI * 2);
    x.fill();
    x.restore();
  };
  sombra(0.235, 0.62, 0.12, 0.08, -0.3, 0.35);
  sombra(-0.235, 0.62, 0.12, 0.08, 0.3, 0.22);
  sombra(0.055, 0.64, 0.035, 0.12, 0.05, 0.40);
  sombra(-0.055, 0.64, 0.030, 0.11, -0.05, 0.25);
  sombra(0, 0.945, 0.11, 0.040, 0, 0.30);
  sombra(P.xPupila, P.yOjos - 0.015, 0.068, 0.034, 0, 0.32);
  sombra(-P.xPupila, P.yOjos - 0.015, 0.068, 0.034, 0, 0.32);

  // --- ojos: pequeños y juntos ---
  const ojo = (signo) => {
    const o = px(signo * P.xPupila, P.yOjos);
    x.fillStyle = '#f7f2ea';
    x.beginPath();
    x.ellipse(o.x, o.y, u(P.semiOjo), u(P.altoOjo), 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#4a3b2e';
    x.beginPath();
    x.arc(o.x, o.y, u(0.021), 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#17120e';
    x.beginPath();
    x.arc(o.x, o.y, u(0.010), 0, Math.PI * 2);
    x.fill();
    // párpado superior
    x.strokeStyle = '#4b3a2c';
    x.lineWidth = u(0.011);
    x.beginPath();
    x.moveTo(o.x - u(P.semiOjo), o.y);
    x.quadraticCurveTo(o.x, o.y - u(0.038), o.x + u(P.semiOjo), o.y - u(0.004));
    x.stroke();
  };
  ojo(1); ojo(-1);

  // --- cejas: gruesas, bajas y caídas por fuera ---
  for (const signo of [1, -1]) {
    x.strokeStyle = '#3f3129';
    x.lineWidth = u(0.030);
    x.lineCap = 'round';
    x.beginPath();
    const a = px(signo * 0.048, P.yCeja);
    const b = px(signo * 0.130, P.yCeja - 0.014);
    const c2 = px(signo * 0.215, P.yCeja + 0.028);
    x.moveTo(a.x, a.y);
    x.quadraticCurveTo(b.x, b.y - u(0.012), c2.x, c2.y);
    x.stroke();
  }

  // --- nariz: ancha, con las fosas marcadas ---
  x.strokeStyle = 'rgba(110,85,68,0.75)';
  x.lineWidth = u(0.010);
  x.beginPath();
  const n1 = px(0.015, 0.52), n2 = px(0.035, P.ySubnasal - 0.03);
  x.moveTo(n1.x, n1.y);
  x.quadraticCurveTo(n2.x, n2.y, px(0.02, P.ySubnasal).x, px(0.02, P.ySubnasal).y);
  x.stroke();
  x.fillStyle = 'rgba(80,58,45,0.85)';
  for (const signo of [1, -1]) {
    const f = px(signo * 0.055, P.ySubnasal - 0.004);
    x.beginPath();
    x.ellipse(f.x, f.y, u(0.020), u(0.012), signo * 0.3, 0, Math.PI * 2);
    x.fill();
  }

  // --- boca ---
  const bI = px(-P.semiBoca, P.yStomion), bD = px(P.semiBoca, P.yStomion);
  x.fillStyle = '#a9655c';
  x.beginPath();
  x.moveTo(bI.x, bI.y);
  x.quadraticCurveTo(cx - u(0.05), bI.y - u(0.035), cx, bI.y - u(0.022));
  x.quadraticCurveTo(cx + u(0.05), bI.y - u(0.035), bD.x, bD.y);
  x.quadraticCurveTo(cx, bI.y + u(0.055), bI.x, bI.y);
  x.fill();
  x.strokeStyle = '#6d4038';
  x.lineWidth = u(0.009);
  x.beginPath();
  x.moveTo(bI.x, bI.y);
  x.quadraticCurveTo(cx, bI.y + u(0.006), bD.x, bD.y);
  x.stroke();

  // --- orejas ---
  for (const signo of [1, -1]) {
    x.fillStyle = '#d2b49c';
    x.beginPath();
    x.ellipse(cx + signo * u(0.325), top + u(0.56), u(0.045), u(0.085), 0, 0, Math.PI * 2);
    x.fill();
  }

  // --- cuello y hombros, para que el recorte tenga contexto ---
  x.fillStyle = '#c0a28c';
  x.fillRect(cx - u(0.13), top + u(0.95), u(0.26), u(0.25));
  x.fillStyle = '#2f3a46';
  x.beginPath();
  x.ellipse(cx, top + u(1.35), u(0.62), u(0.28), 0, Math.PI, Math.PI * 2);
  x.fill();

  // --- puntos marcados: los mismos que pediría el modo manual ---
  const marcadas = {
    pupilaI: px(-P.xPupila, P.yOjos), pupilaD: px(P.xPupila, P.yOjos),
    ojoIExt: px(-P.xPupila - P.semiOjo, P.yOjos), ojoIInt: px(-P.xPupila + P.semiOjo, P.yOjos + 0.004),
    ojoDInt: px(P.xPupila - P.semiOjo, P.yOjos + 0.004), ojoDExt: px(P.xPupila + P.semiOjo, P.yOjos),
    cejaI: px(-0.130, P.yCeja - 0.020), cejaD: px(0.130, P.yCeja - 0.020),
    nasion: px(0, 0.495), puntaNariz: px(0, P.ySubnasal - 0.035),
    alarI: px(-P.semiAlar, P.ySubnasal - 0.010), alarD: px(P.semiAlar, P.ySubnasal - 0.010),
    comisuraI: px(-P.semiBoca, P.yStomion), comisuraD: px(P.semiBoca, P.yStomion),
    labioSup: px(0, P.yStomion - 0.030), labioInf: px(0, P.yStomion + 0.040),
    menton: px(0, 1.0),
    mandibulaI: px(-0.330, 0.78), mandibulaD: px(0.330, 0.78),
    sienI: px(-0.335, 0.50), sienD: px(0.335, 0.50),
    coronilla: px(0, 0.0),
  };
  return { canvas: c, marcadas };
}
