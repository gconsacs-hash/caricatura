// mls.js — deformación de imagen por mínimos cuadrados móviles (Schaefer, McPhail y
// Warren, 2006), variante de semejanza. A partir de pares de puntos de control
// (origen → destino) construye una deformación suave de todo el plano: sin triangulación,
// sin costuras y sin que las zonas lejanas se descuadren.

/** Crea la función de deformación v ↦ f(v) para los pares dados. */
export function deformacion(origen, destino, alfa = 1.2) {
  const n = origen.length;
  const px = new Float64Array(n), py = new Float64Array(n);
  const qx = new Float64Array(n), qy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = origen[i].x; py[i] = origen[i].y;
    qx[i] = destino[i].x; qy[i] = destino[i].y;
  }
  const w = new Float64Array(n);

  return function f(vx, vy) {
    let sw = 0;
    for (let i = 0; i < n; i++) {
      const dx = px[i] - vx, dy = py[i] - vy;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1e-12) return { x: qx[i], y: qy[i] };
      w[i] = 1 / Math.pow(d2, alfa);
      sw += w[i];
    }
    let pcx = 0, pcy = 0, qcx = 0, qcy = 0;
    for (let i = 0; i < n; i++) {
      pcx += w[i] * px[i]; pcy += w[i] * py[i];
      qcx += w[i] * qx[i]; qcy += w[i] * qy[i];
    }
    pcx /= sw; pcy /= sw; qcx /= sw; qcy /= sw;

    const dvx = vx - pcx, dvy = vy - pcy;
    let mu = 0, ax = 0, ay = 0;
    for (let i = 0; i < n; i++) {
      const phx = px[i] - pcx, phy = py[i] - pcy;
      const qhx = qx[i] - qcx, qhy = qy[i] - qcy;
      mu += w[i] * (phx * phx + phy * phy);
      // A_i = w·[[s, c], [−c, s]] con s = p̂·d y c = p̂ × d
      const s = phx * dvx + phy * dvy;
      const cr = phx * dvy - phy * dvx;
      ax += w[i] * (qhx * s - qhy * cr);
      ay += w[i] * (qhx * cr + qhy * s);
    }
    if (mu < 1e-12) return { x: qcx + dvx, y: qcy + dvy };
    return { x: qcx + ax / mu, y: qcy + ay / mu };
  };
}

/**
 * Campo de desplazamiento muestreado en una rejilla, para no evaluar la deformación
 * en cada píxel. Devuelve los offsets (origen − destino) listos para interpolar.
 */
export function campo(ancho, alto, paso, f) {
  const cols = Math.ceil(ancho / paso) + 1;
  const filas = Math.ceil(alto / paso) + 1;
  const ox = new Float32Array(cols * filas);
  const oy = new Float32Array(cols * filas);
  for (let j = 0; j < filas; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * paso, y = j * paso;
      const r = f(x, y);
      ox[j * cols + i] = r.x;
      oy[j * cols + i] = r.y;
    }
  }
  return { cols, filas, paso, ox, oy };
}

/** Consulta bilineal del campo. */
export function muestra(campo, x, y) {
  const { cols, filas, paso, ox, oy } = campo;
  let gx = x / paso, gy = y / paso;
  if (gx < 0) gx = 0; if (gy < 0) gy = 0;
  if (gx > cols - 1) gx = cols - 1;
  if (gy > filas - 1) gy = filas - 1;
  const i0 = Math.floor(gx), j0 = Math.floor(gy);
  const i1 = Math.min(i0 + 1, cols - 1), j1 = Math.min(j0 + 1, filas - 1);
  const tx = gx - i0, ty = gy - j0;
  const a = j0 * cols + i0, b = j0 * cols + i1, cc = j1 * cols + i0, d = j1 * cols + i1;
  const lx = (ox[a] * (1 - tx) + ox[b] * tx) * (1 - ty) + (ox[cc] * (1 - tx) + ox[d] * tx) * ty;
  const ly = (oy[a] * (1 - tx) + oy[b] * tx) * (1 - ty) + (oy[cc] * (1 - tx) + oy[d] * tx) * ty;
  return { x: lx, y: ly };
}

/**
 * Deforma una imagen. Para cada píxel de salida busca de dónde viene en la original,
 * así que la deformación se construye al revés: de destino a origen.
 * @param {ImageData} fuente
 * @param {Array} origen   puntos de control en la imagen original
 * @param {Array} destino  posiciones exageradas
 * @param {object} opciones {paso, bordes}
 * @returns {ImageData}
 */
export function deformarImagen(fuente, origen, destino, crearImageData, opciones = {}) {
  const { width: W, height: H, data: src } = fuente;
  const paso = opciones.paso ?? 6;

  // Anclas en el borde para que el fondo no se arrastre entero.
  const anclas = [];
  const pasos = 5;
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    anclas.push({ x: t * W, y: 0 }, { x: t * W, y: H - 1 }, { x: 0, y: t * H }, { x: W - 1, y: t * H });
  }
  const P = [...destino, ...anclas];   // en el destino
  const Q = [...origen, ...anclas];    // de dónde viene
  const inversa = deformacion(P, Q, opciones.alfa ?? 1.2);
  const c = campo(W, H, paso, inversa);

  const salida = crearImageData(W, H);
  const dst = salida.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { x: sx, y: sy } = muestra(c, x, y);
      const i = (y * W + x) * 4;
      // bilineal con sujeción a los bordes
      let fx = sx, fy = sy;
      if (fx < 0) fx = 0; if (fy < 0) fy = 0;
      if (fx > W - 1) fx = W - 1; if (fy > H - 1) fy = H - 1;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
      const tx = fx - x0, ty = fy - y0;
      const a = (y0 * W + x0) * 4, b = (y0 * W + x1) * 4;
      const cc = (y1 * W + x0) * 4, d = (y1 * W + x1) * 4;
      for (let k = 0; k < 4; k++) {
        const arriba = src[a + k] * (1 - tx) + src[b + k] * tx;
        const abajo = src[cc + k] * (1 - tx) + src[d + k] * tx;
        dst[i + k] = arriba * (1 - ty) + abajo * ty;
      }
    }
  }
  return salida;
}

/** Submuestreo de puntos de control: la malla completa (478) es innecesaria y lenta. */
export function controlesDesdeMalla(rostro, puntosExagerados, extraOrig = [], extraExag = []) {
  const ids = new Set();
  for (const i of rostro.ovalo) ids.add(i);
  for (const g of Object.values(rostro.grupos)) for (const i of g) ids.add(i);
  for (const i of Object.values(rostro.refs)) if (typeof i === 'number') ids.add(i);
  // algunos puntos interiores repartidos, para que las mejillas acompañen
  const n = rostro.puntos.length;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 60))) ids.add(i);
  const lista = [...ids].filter((i) => i < n);
  return {
    origen: [...lista.map((i) => rostro.puntos[i]), ...extraOrig],
    destino: [...lista.map((i) => puntosExagerados[i]), ...extraExag],
  };
}
