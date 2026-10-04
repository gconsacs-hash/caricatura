// imagen.js — procesado de imagen para el acabado a mano: línea de tinta y tramado.
//
// La línea sale de un XDoG (diferencia extendida de gaussianas, Winnemöller 2011), que
// es lo que mejor imita una entintada: líneas gruesas donde el contraste manda y nada
// donde la piel es plana. El tramado se dibuja siguiendo las isofotas de la imagen, así
// las rayas envuelven el volumen de la cabeza en vez de cruzarla en plano, que es la
// corrección que Loomis repite en todo su libro.

/** Luminancia 0..1 de un ImageData. */
export function aGris({ data, width, height }) {
  const g = new Float32Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  }
  return g;
}

function nucleoGauss(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v; s += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return { k, r };
}

/** Desenfoque gaussiano separable con bordes reflejados. */
export function desenfoque(src, W, H, sigma) {
  if (sigma <= 0.05) return Float32Array.from(src);
  const { k, r } = nucleoGauss(sigma);
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        let xx = x + i;
        if (xx < 0) xx = -xx;
        if (xx >= W) xx = 2 * W - xx - 2;
        if (xx < 0) xx = 0;
        s += src[y * W + xx] * k[i + r];
      }
      tmp[y * W + x] = s;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        let yy = y + i;
        if (yy < 0) yy = -yy;
        if (yy >= H) yy = 2 * H - yy - 2;
        if (yy < 0) yy = 0;
        s += tmp[yy * W + x] * k[i + r];
      }
      out[y * W + x] = s;
    }
  }
  return out;
}

/**
 * Línea de tinta por diferencia de gaussianas con umbral.
 *
 * Sobre el XDoG clásico de Winnemöller se cambia una cosa a propósito: él compara la
 * luminancia con un umbral absoluto, así que cualquier zona oscura y lisa (el pelo, una
 * chaqueta) se vuelve una mancha negra. Aquí se compara el píxel con su propio entorno
 *   d = desenfoque_grande − desenfoque_pequeño
 * que vale 0 en cualquier superficie lisa, clara u oscura, y solo se dispara en los
 * bordes. El negro de las masas lo pone el tramado, no la línea.
 *
 * Devuelve 1 = papel, 0 = tinta.
 */
export function lineas(gris, W, H, o = {}) {
  const sigma = o.sigma ?? 1.1;
  const k = o.k ?? 1.7;
  const umbral = o.umbral ?? 0.012;
  const phi = o.phi ?? 26;
  const g1 = desenfoque(gris, W, H, sigma);
  const g2 = desenfoque(gris, W, H, sigma * k);
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) {
    const d = g2[i] - g1[i];              // > 0 donde el píxel es más oscuro que su entorno
    let tinta = d <= umbral ? 0 : Math.tanh(phi * (d - umbral));
    if (tinta > 1) tinta = 1;
    out[i] = 1 - tinta;
  }
  return out;
}

/** Gradientes Sobel sobre un buffer. */
export function gradientes(buf, W, H) {
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
  const at = (x, y) => buf[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      gx[i] = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
            - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      gy[i] = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
            - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    }
  }
  return { gx, gy };
}

/** Ajuste de niveles con control de medios tonos. */
export function niveles(buf, { negro = 0, blanco = 1, gama = 1 }) {
  const out = new Float32Array(buf.length);
  const d = Math.max(1e-6, blanco - negro);
  for (let i = 0; i < buf.length; i++) {
    let t = (buf[i] - negro) / d;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out[i] = Math.pow(t, gama);
  }
  return out;
}

/**
 * Reparte el tono entre 0 y 1 usando los percentiles de la propia imagen.
 * Sin esto, el tramado depende de la exposición de la foto: una foto clara no recibiría
 * ninguna raya y una oscura saldría toda negra. Con esto, cada retrato se trama por sus
 * propias sombras, que es como mira un dibujante.
 */
export function normalizarTono(gris, { bajo = 0.04, alto = 0.96 } = {}) {
  const cubos = 256;
  const histograma = new Int32Array(cubos);
  for (let i = 0; i < gris.length; i++) {
    let v = Math.round(gris[i] * (cubos - 1));
    if (v < 0) v = 0; if (v > cubos - 1) v = cubos - 1;
    histograma[v]++;
  }
  const objetivoBajo = gris.length * bajo, objetivoAlto = gris.length * alto;
  let acumulado = 0, vBajo = 0, vAlto = cubos - 1;
  for (let i = 0; i < cubos; i++) {
    acumulado += histograma[i];
    if (acumulado >= objetivoBajo) { vBajo = i; break; }
  }
  acumulado = 0;
  for (let i = 0; i < cubos; i++) {
    acumulado += histograma[i];
    if (acumulado >= objetivoAlto) { vAlto = i; break; }
  }
  const a = vBajo / (cubos - 1), b = vAlto / (cubos - 1);
  const d = b - a;
  // Una superficie casi lisa no tiene rango que repartir: estirarla sería inventar
  // sombras donde no las hay.
  if (d < 0.12) return Float32Array.from(gris);
  const salida = new Float32Array(gris.length);
  for (let i = 0; i < gris.length; i++) {
    const t = (gris[i] - a) / d;
    salida[i] = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  return salida;
}

/**
 * Tramado que envuelve la forma. Devuelve una lista de trazos en coordenadas de imagen.
 * Cada pasada añade una capa más oscura, cruzando un poco el ángulo de la anterior.
 */
export function hachuras(grisOriginal, W, H, o = {}) {
  const espaciado = o.espaciado ?? 7;
  const pasadas = o.pasadas ?? [
    { umbral: 0.52, cruce: 0, largo: 2.4 },
    { umbral: 0.32, cruce: 42, largo: 2.1 },
    { umbral: 0.15, cruce: -40, largo: 1.9 },
  ];
  const gris = o.normalizar === false ? grisOriginal : normalizarTono(grisOriginal, o.percentiles);
  const suave = desenfoque(gris, W, H, o.suavizado ?? 3.5);
  const forma = desenfoque(gris, W, H, o.suavizadoForma ?? 7);
  const { gx, gy } = gradientes(forma, W, H);
  const mascara = o.mascara || null;   // función (x,y) => 0..1

  const trazos = [];
  const rnd = (a, b) => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };

  pasadas.forEach((pasada, nivel) => {
    const paso = espaciado * (1 + nivel * 0.15);
    const desfase = (nivel % 2) * paso * 0.5;
    for (let y = paso; y < H; y += paso) {
      for (let x = paso + desfase; x < W; x += paso) {
        const i = Math.round(y) * W + Math.round(x);
        const t = suave[i];
        if (t >= pasada.umbral) continue;
        if (mascara && mascara(x, y) < 0.5) continue;
        // intensidad relativa dentro de la banda de esta pasada
        const dentro = Math.min(1, (pasada.umbral - t) / 0.2);
        // dirección de la isofota = perpendicular al gradiente
        let ang = Math.atan2(gy[i], gx[i]) + Math.PI / 2;
        const fuerza = Math.hypot(gx[i], gy[i]);
        if (fuerza < 0.02) ang = -Math.PI / 3;   // zonas planas: diagonal de oficio
        ang += (pasada.cruce * Math.PI) / 180;
        ang += rnd(x, y + nivel * 17) * 0.09;
        const L = paso * pasada.largo * (0.8 + 0.4 * dentro);
        const cx = x + rnd(x + 3, y) * paso * 0.3;
        const cy = y + rnd(x, y + 5) * paso * 0.3;
        const dx = (Math.cos(ang) * L) / 2, dy = (Math.sin(ang) * L) / 2;
        trazos.push({
          x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy,
          ancho: 0.8 + nivel * 0.25 + dentro * 0.5,
          alfa: 0.28 + dentro * 0.4,
        });
      }
    }
  });
  return trazos;
}

/** Convierte un buffer 0..1 en ImageData en escala de grises (1 = blanco). */
export function aImageData(buf, W, H, crearImageData, tinte = [20, 18, 16]) {
  const img = crearImageData(W, H);
  const d = img.data;
  for (let i = 0, j = 0; j < buf.length; i += 4, j++) {
    const t = buf[j];
    d[i] = 255 - (255 - tinte[0]) * (1 - t);
    d[i + 1] = 255 - (255 - tinte[1]) * (1 - t);
    d[i + 2] = 255 - (255 - tinte[2]) * (1 - t);
    d[i + 3] = 255;
  }
  return img;
}

/** Máscara suave de un polígono (para limitar el tramado a la cabeza). */
export function mascaraPoligono(poligono, margen = 0) {
  const n = poligono.length;
  let cx = 0, cy = 0;
  for (const p of poligono) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  const ampliado = poligono.map((p) => ({
    x: p.x + (p.x - cx) * (margen / 100),
    y: p.y + (p.y - cy) * (margen / 100),
  }));
  return (x, y) => {
    let dentro = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = ampliado[i], b = ampliado[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
    }
    return dentro ? 1 : 0;
  };
}
