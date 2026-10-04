// canon.js — El canon de proporciones de Andrew Loomis, escrito como datos.
//
// Todas las medidas están en "alturas de cabeza": la cabeza mide 1.0 desde la coronilla
// (y=0) hasta la base del mentón (y=1). Las reglas que fija Loomis en "Drawing the Head
// and Hands" y que aquí se respetan:
//   · el ancho de la cabeza es ~2/3 de su altura;
//   · la línea de los ojos cae a MITAD de la altura total de la cabeza;
//   · la base de la nariz está a mitad de camino entre las cejas y el mentón;
//   · la boca queda a un tercio del camino entre la base de la nariz y el mentón;
//   · la oreja ocupa de la ceja a la base de la nariz;
//   · el rostro mide cinco anchos de ojo, y los ojos ocupan el 2º y el 4º quinto.
//
// Ningún número del análisis se "ajusta a mano": las medidas del canon se obtienen
// midiendo este rostro con la misma función que mide la foto del usuario (ver medidas.js).

export const PROPORCIONES = {
  alto: 1.0,
  anchoMax: 0.68,          // 2/3 de la altura, en los pómulos/sienes
  yCoronilla: 0.00,
  yNacimientoPelo: 0.26,
  yCeja: 0.38,
  yOjos: 0.50,             // mitad exacta de la cabeza
  ySubnasal: 0.69,         // mitad entre ceja y mentón: (0.38 + 1.0) / 2
  yStomion: 0.7933,        // un tercio de subnasal a mentón: 0.69 + (1 − 0.69)/3
  yMenton: 1.00,
  xPupila: 0.125,          // separación interpupilar 0.25
  anchoOjo: 0.125,         // un quinto del ancho del rostro
  altoOjo: 0.042,
  yNasion: 0.465,
  anchoAlar: 0.145,
  anchoBoca: 0.195,        // ~1.5 anchos de ojo
  altoLabios: 0.060,
  yOrejaSup: 0.38,         // de la ceja...
  yOrejaInf: 0.69,         // ...a la base de la nariz
  xOreja: 0.345,
};

// Perfil de la silueta: media-anchura de la cabeza a distintas alturas.
const SILUETA = [
  [0.000, 0.000], [0.030, 0.120], [0.075, 0.205], [0.140, 0.265],
  [0.230, 0.305], [0.330, 0.330], [0.440, 0.340], [0.545, 0.332],
  [0.640, 0.310], [0.730, 0.272], [0.800, 0.228], [0.865, 0.175],
  [0.935, 0.110], [1.000, 0.030],
];

/** Construye el rostro del canon: lista de puntos + anillo de silueta + referencias,
 *  con la misma estructura que un rostro detectado en una foto. */
export function construirCanon(escala = 400, centroX = 0, centroY = 0) {
  const P = PROPORCIONES;
  const puntos = [];
  const px = (x, y) => { puntos.push({ x: centroX + x * escala, y: centroY + y * escala }); return puntos.length - 1; };

  // --- silueta: coronilla, lado derecho de la imagen, mentón, lado izquierdo ---
  const ovalo = [];
  ovalo.push(px(0, P.yCoronilla));
  for (let i = 1; i < SILUETA.length - 1; i++) ovalo.push(px(SILUETA[i][1], SILUETA[i][0]));
  ovalo.push(px(0, P.yMenton));
  for (let i = SILUETA.length - 2; i >= 1; i--) ovalo.push(px(-SILUETA[i][1], SILUETA[i][0]));

  // --- ojos: elipse de 8 puntos, con comisuras marcadas ---
  const ojo = (signo) => {
    const cx = signo * P.xPupila, rx = P.anchoOjo / 2, ry = P.altoOjo / 2;
    const ext = px(cx + signo * rx, P.yOjos - 0.004);   // comisura externa, algo más alta
    const sup = px(cx, P.yOjos - ry);
    const int = px(cx - signo * rx, P.yOjos + 0.004);   // comisura interna, algo más baja
    const inf = px(cx, P.yOjos + ry);
    const anillo = [
      ext,
      px(cx + signo * rx * 0.55, P.yOjos - ry * 0.85),
      sup,
      px(cx - signo * rx * 0.55, P.yOjos - ry * 0.80),
      int,
      px(cx - signo * rx * 0.50, P.yOjos + ry * 0.75),
      inf,
      px(cx + signo * rx * 0.50, P.yOjos + ry * 0.80),
    ];
    const pupila = px(cx, P.yOjos);
    return { anillo, ext, int, sup, inf, pupila };
  };
  const ojoD = ojo(1);   // lado derecho de la imagen
  const ojoI = ojo(-1);

  // --- cejas: 5 puntos, arco con el pico sobre el borde externo del iris ---
  const ceja = (signo) => [
    px(signo * 0.055, P.yCeja + 0.012),
    px(signo * 0.100, P.yCeja - 0.008),
    px(signo * 0.155, P.yCeja - 0.018),
    px(signo * 0.200, P.yCeja - 0.002),
    px(signo * 0.235, P.yCeja + 0.020),
  ];
  const cejaD = ceja(1);
  const cejaI = ceja(-1);

  // --- nariz ---
  const nasion = px(0, P.yNasion);
  const puente = [px(-0.022, P.yNasion + 0.06), px(0.022, P.yNasion + 0.06)];
  const puntaNariz = px(0, P.ySubnasal - 0.035);
  const alarD = px(P.anchoAlar / 2, P.ySubnasal - 0.012);
  const alarI = px(-P.anchoAlar / 2, P.ySubnasal - 0.012);
  const subnasal = px(0, P.ySubnasal);
  const fosaD = px(0.040, P.ySubnasal - 0.004);
  const fosaI = px(-0.040, P.ySubnasal - 0.004);

  // --- boca: anillo exterior de 12 puntos ---
  const mw = P.anchoBoca / 2, lh = P.altoLabios;
  const comisuraD = px(mw, P.yStomion);
  const comisuraI = px(-mw, P.yStomion);
  const labioSup = px(0, P.yStomion - lh * 0.45);
  const labioInf = px(0, P.yStomion + lh * 0.55);
  const stomion = px(0, P.yStomion);
  const boca = [
    comisuraD,
    px(mw * 0.62, P.yStomion - lh * 0.32),
    px(mw * 0.26, P.yStomion - lh * 0.48),  // arco de cupido
    labioSup,
    px(-mw * 0.26, P.yStomion - lh * 0.48),
    px(-mw * 0.62, P.yStomion - lh * 0.32),
    comisuraI,
    px(-mw * 0.58, P.yStomion + lh * 0.30),
    px(-mw * 0.24, P.yStomion + lh * 0.52),
    labioInf,
    px(mw * 0.24, P.yStomion + lh * 0.52),
    px(mw * 0.58, P.yStomion + lh * 0.30),
  ];

  const menton = ovalo[Math.floor(ovalo.length / 2)];

  return {
    puntos,
    ovalo,
    modo: 'canon',
    refs: {
      pupilaD: ojoD.pupila, pupilaI: ojoI.pupila,
      ojoDExt: ojoD.ext, ojoDInt: ojoD.int, ojoDSup: ojoD.sup, ojoDInf: ojoD.inf,
      ojoIExt: ojoI.ext, ojoIInt: ojoI.int, ojoISup: ojoI.sup, ojoIInf: ojoI.inf,
      nasion, puntaNariz, subnasal, alarD, alarI,
      comisuraD, comisuraI, labioSup, labioInf, stomion, menton,
    },
    grupos: {
      ojoD: ojoD.anillo, ojoI: ojoI.anillo,
      cejaD, cejaI, boca,
      nariz: [nasion, ...puente, puntaNariz, alarD, alarI, subnasal, fosaD, fosaI],
    },
  };
}

/** Puntos de referencia que definen la escala y la alineación. Deben existir en
 *  cualquier rostro, venga de la detección automática o del trazado manual. */
export const REFERENCIAS = [
  'pupilaD', 'pupilaI', 'ojoDExt', 'ojoDInt', 'ojoIExt', 'ojoIInt',
  'nasion', 'puntaNariz', 'subnasal', 'alarD', 'alarI',
  'comisuraD', 'comisuraI', 'stomion', 'menton',
];
