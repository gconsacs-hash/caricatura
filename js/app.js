// app.js — interfaz: carga la foto, encuentra el rostro, muestra el análisis y dibuja.

import * as deteccion from './deteccion.js';
import { desdeMalla, desdeManual, GUIA_MANUAL } from './rostro.js';
import { medir, canonLoomis, canonPromedio, desviaciones, describir, MEDIDAS } from './medidas.js';
import { exagerar, puntosVirtuales, AJUSTES_LIBRES } from './exagerar.js';
import { deformarImagen, controlesDesdeMalla } from './mls.js';
import { aGris, lineas, hachuras, mascaraPoligono, aImageData } from './imagen.js';
import { trazos, pintarTrazos, trazosASvg } from './trazo.js';
import { construccion, pintarConstruccion } from './loomis.js';
import { envolvente, inflar } from './geometria.js';
import { dibujarRostroDePrueba } from './demo.js';

const CLAVE_CANON = 'caricatura.canon.v1';
const CLAVE_CALIDAD = 'caricatura.calidad.v1';

// Tamaño al que se trabaja la imagen. En un teléfono, 900 px de lado son ~2 s de espera
// por cada movimiento de un control, así que se arranca más abajo y se puede subir.
const esPantallaChica = window.matchMedia('(max-width: 900px)').matches;
function calidadInicial() {
  try {
    const guardada = parseInt(localStorage.getItem(CLAVE_CALIDAD), 10);
    if ([520, 720, 900].includes(guardada)) return guardada;
  } catch (e) { /* sin almacenamiento */ }
  if (esPantallaChica) return navigator.hardwareConcurrency >= 8 ? 720 : 520;
  return 900;
}
let LADO = calidadInicial();

const $ = (s) => document.querySelector(s);
const lienzoOriginal = $('#lienzoOriginal');
const lienzoCaricatura = $('#lienzoCaricatura');

const ESTILOS = {
  kascht: {
    nombre: 'Tinta (Kascht)', nota: 'línea nerviosa y tramado',
    papel: '#f6efe0', tinta: [16, 14, 12], paleta: 'tinta',
    capas: { foto: false, tinta: true, tramado: true, trazo: false, construccion: false },
    linea: { sigma: 1.0, k: 1.7, umbral: 0.009, phi: 32 },
    tramado: { espaciado: 6 },
  },
  loomis: {
    nombre: 'Lápiz (Loomis)', nota: 'con la construcción a la vista',
    papel: '#f4f0e6', tinta: [62, 58, 51], paleta: 'lapiz',
    capas: { foto: false, tinta: true, tramado: true, trazo: true, construccion: true },
    linea: { sigma: 1.5, k: 1.8, umbral: 0.016, phi: 16 },
    tramado: {
      espaciado: 9,
      pasadas: [{ umbral: 0.62, cruce: 0, largo: 2.3 }, { umbral: 0.40, cruce: 40, largo: 2.0 }],
    },
  },
  limpio: {
    nombre: 'Solo trazo', nota: 'línea vectorial, sin foto',
    papel: '#fffdf7', tinta: [16, 14, 12], paleta: 'tinta',
    capas: { foto: false, tinta: false, tramado: false, trazo: true, construccion: false },
  },
  foto: {
    nombre: 'Foto deformada', nota: 'la caricatura sin estilizar',
    papel: '#101216', tinta: [16, 14, 12], paleta: 'tinta',
    capas: { foto: true, tinta: false, tramado: false, trazo: false, construccion: false },
  },
};

const NOMBRES_CAPA = {
  foto: 'Foto', tinta: 'Línea', tramado: 'Tramado', trazo: 'Trazo limpio', construccion: 'Construcción',
};

const S = {
  base: null,              // canvas con la foto ya encuadrada
  rostro: null,
  medidas: null,
  aprendidos: [],
  usarAprendido: false,
  ajustes: { intensidad: 1.2, porMedida: {}, libres: { craneoAlto: 0, cuello: 0 } },
  estilo: 'kascht',
  capas: { ...ESTILOS.kascht.capas },
  fuente: null,            // {tipo:'imagen', img} | {tipo:'demo'}
  modoManual: null,        // {paso, marcadas}
  retocando: false,
  arrastre: null,
  cache: null,
  ultimo: null,            // resultado del último render, para exportar
};

// ───────────────────────── utilidades ─────────────────────────

const canonActivo = () => (S.usarAprendido && S.aprendidos.length ? canonPromedio(S.aprendidos) : canonLoomis());

function nuevoCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function aCanvas(imageData) {
  const c = nuevoCanvas(imageData.width, imageData.height);
  c.getContext('2d').putImageData(imageData, 0, 0);
  return c;
}

function mostrar(selector, visible = true) {
  $(selector).classList.toggle('oculto', !visible);
}

let temporizadorTrabajo = null;
function trabajando(si) {
  clearTimeout(temporizadorTrabajo);
  if (si) {
    temporizadorTrabajo = setTimeout(() => $('#trabajando').classList.remove('oculto'), 180);
  } else {
    $('#trabajando').classList.add('oculto');
  }
}

const respirar = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function descargar(nombre, blobOUrl) {
  const a = document.createElement('a');
  a.download = nombre;
  a.href = typeof blobOUrl === 'string' ? blobOUrl : URL.createObjectURL(blobOUrl);
  a.click();
  if (typeof blobOUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ───────────────────────── carga de la foto ─────────────────────────

function lienzoDesdeImagen(img) {
  const ancho = img.naturalWidth || img.width;
  const alto = img.naturalHeight || img.height;
  const k = Math.min(LADO / ancho, LADO / alto, 2);
  const c = nuevoCanvas(Math.round(ancho * k), Math.round(alto * k));
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function cargarArchivo(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = url; });
    S.fuente = { tipo: 'imagen', img };
    await usarLienzo(lienzoDesdeImagen(img));
  } catch (e) {
    avisar('No pude leer esa imagen.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rehace el lienzo base desde la fuente original (al cambiar el tamaño de trabajo). */
async function recargarFuente() {
  if (!S.fuente) return;
  if (S.fuente.tipo === 'demo') {
    const { canvas, marcadas } = dibujarRostroDePrueba(LADO);
    await usarLienzo(canvas, marcadas);
  } else {
    await usarLienzo(lienzoDesdeImagen(S.fuente.img));
  }
}

function avisar(texto) {
  const a = $('#aviso');
  a.textContent = texto;
  a.classList.remove('oculto');
  $('#lienzos').style.visibility = 'hidden';
}

function listoParaDibujar() {
  $('#aviso').classList.add('oculto');
  $('#lienzos').style.visibility = 'visible';
}

/** Recorta alrededor de la cabeza y devuelve la transformación aplicada. */
function encuadrarCabeza(base, rostro) {
  const m = medir(rostro);
  const virt = puntosVirtuales(rostro, m);
  const todos = [...rostro.puntos, ...virt];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of todos) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  const w = x1 - x0, h = y1 - y0;
  let a = x0 - w * 0.30, b = y0 - h * 0.18, c = x1 + w * 0.30, d = y1 + h * 0.22;
  // proporción de retrato 4:5
  const anchoDeseado = (d - b) * 0.8;
  const centroX = (a + c) / 2;
  a = centroX - anchoDeseado / 2; c = centroX + anchoDeseado / 2;
  a = Math.max(0, a); b = Math.max(0, b);
  c = Math.min(base.width, c); d = Math.min(base.height, d);
  const recorteAncho = Math.max(32, c - a), recorteAlto = Math.max(32, d - b);
  const k = Math.min(LADO / recorteAncho, LADO / recorteAlto, 2.2);
  const salida = nuevoCanvas(Math.round(recorteAncho * k), Math.round(recorteAlto * k));
  const x = salida.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(base, a, b, recorteAncho, recorteAlto, 0, 0, salida.width, salida.height);
  const mover = (p) => ({ x: (p.x - a) * k, y: (p.y - b) * k });
  return { canvas: salida, mover };
}

async function usarLienzo(base, marcadasConocidas = null) {
  S.base = base;
  S.cache = null;
  trabajando(true);
  $('#estadoRostro').textContent = deteccion.estaListo() || marcadasConocidas
    ? 'Buscando el rostro…'
    : 'Preparando el detector (16 MB la primera vez)…';
  $('#estadoRostro').className = 'estado';
  mostrar('#bloqueRostro', true);
  await respirar();

  let rostro = null;
  let falloDetector = false;
  if (marcadasConocidas) {
    rostro = desdeManual(marcadasConocidas, base.width, base.height);
    $('#estadoRostro').textContent = 'Puntos del dibujo de prueba (modo manual).';
    $('#estadoRostro').className = 'estado ok';
  } else {
    try {
      const r = await deteccion.detectar(base);
      if (r) {
        rostro = desdeMalla(r.marcas, base.width, base.height);
        const ang = deteccion.angulos(r.matriz);
        const giro = ang ? ` · giro ${ang.giro.toFixed(0)}°, inclinación ${ang.inclinacion.toFixed(0)}°` : '';
        $('#estadoRostro').textContent = `Rostro detectado: 478 puntos${giro}.`;
        $('#estadoRostro').className = 'estado ok';
        if (ang && Math.abs(ang.giro) > 22) {
          $('#pistaManual').textContent = 'La cabeza está bastante girada; el canon se mide de frente, así que el análisis pierde precisión.';
        } else {
          $('#pistaManual').textContent = '';
        }
      }
    } catch (e) {
      falloDetector = true;
      console.error(e);
    }
  }

  if (!rostro) {
    // Distinguir las dos causas importa: una se arregla marcando puntos, la otra
    // es que no hay red y el detector no estaba guardado.
    $('#estadoRostro').textContent = falloDetector
      ? 'No pude cargar el detector (¿sin conexión?). Marca el rostro a mano.'
      : 'No encontré un rostro. Márcalo a mano.';
    $('#estadoRostro').className = 'estado aviso';
    trabajando(false);
    dibujarOriginal();
    listoParaDibujar();
    empezarManual();
    return;
  }

  // Encuadre en la cabeza (con los puntos trasladados al recorte).
  if ($('#encuadrar').checked && !marcadasConocidas) {
    const { canvas, mover } = encuadrarCabeza(base, rostro);
    S.base = canvas;
    rostro = { ...rostro, puntos: rostro.puntos.map(mover), ancho: canvas.width, alto: canvas.height };
  }

  S.rostro = rostro;
  S.medidas = medir(rostro);
  listoParaDibujar();
  construirAnalisis();
  construirDeslizadores();
  mostrar('#bloqueAnalisis', true);
  mostrar('#bloqueExagerar', true);
  mostrar('#bloqueEstilo', true);
  mostrar('#bloqueExportar', true);
  await dibujar();
  trabajando(false);
}

// ───────────────────────── análisis ─────────────────────────

function construirAnalisis() {
  const ds = desviaciones(S.medidas, canonActivo());
  const ol = $('#rasgos');
  ol.innerHTML = '';
  const maximo = Math.max(0.0001, ds[0].magnitud);
  for (const d of ds.slice(0, 4)) {
    const t = describir(d);
    const li = document.createElement('li');
    li.innerHTML = `<span class="rasgo"></span><span class="detalle"></span>
      <span class="barra${d.desv < 0 ? ' menos' : ''}"><i></i></span>`;
    li.querySelector('.rasgo').textContent = t.rasgo;
    li.querySelector('.detalle').textContent = t.detalle;
    li.querySelector('.barra i').style.width = `${Math.round((d.magnitud / maximo) * 100)}%`;
    ol.appendChild(li);
  }

  const tabla = $('#tablaMedidas');
  tabla.innerHTML = '';
  for (const d of ds) {
    const tr = document.createElement('tr');
    const pct = d.medida.tipo === 'escala' ? `${(d.relativa * 100).toFixed(0)}%`
      : d.medida.tipo === 'angulo' ? `${d.desv.toFixed(1)}°` : d.desv.toFixed(3);
    tr.innerHTML = '<td></td><td></td><td></td>';
    tr.children[0].textContent = d.medida.etiqueta;
    tr.children[1].textContent = d.valor.toFixed(2);
    tr.children[2].textContent = pct;
    tr.children[2].className = d.desv > 0 ? 'sube' : d.desv < 0 ? 'baja' : '';
    tabla.appendChild(tr);
  }
  $('#numAprendido').textContent = String(S.aprendidos.length);
}

function construirDeslizadores() {
  const caja = $('#deslizadores');
  caja.innerHTML = '';
  let zonaActual = null;
  for (const m of MEDIDAS) {
    if (m.zona !== zonaActual) {
      zonaActual = m.zona;
      const h = document.createElement('div');
      h.className = 'zona';
      h.textContent = zonaActual;
      caja.appendChild(h);
    }
    const valor = S.ajustes.porMedida[m.id] ?? 1;
    const l = document.createElement('label');
    l.className = 'deslizador';
    l.innerHTML = `<span><em></em><b></b></span><input type="range" min="0" max="2.5" step="0.05">`;
    l.querySelector('em').textContent = m.etiqueta;
    l.querySelector('b').textContent = valor.toFixed(2).replace('.', ',');
    const r = l.querySelector('input');
    r.value = String(valor);
    r.addEventListener('input', () => {
      S.ajustes.porMedida[m.id] = parseFloat(r.value);
      l.querySelector('b').textContent = parseFloat(r.value).toFixed(2).replace('.', ',');
      pedirDibujo(true);
    });
    r.addEventListener('change', () => pedirDibujo(false));
    caja.appendChild(l);
  }

  const libres = $('#libres');
  libres.innerHTML = '';
  for (const a of AJUSTES_LIBRES) {
    const l = document.createElement('label');
    l.className = 'deslizador';
    l.innerHTML = `<span><em></em><b></b></span><input type="range" min="-0.6" max="0.6" step="0.02">
      <p class="ayuda"></p>`;
    l.querySelector('em').textContent = a.etiqueta;
    l.querySelector('.ayuda').textContent = a.ayuda;
    const r = l.querySelector('input');
    r.value = String(S.ajustes.libres[a.id] ?? 0);
    l.querySelector('b').textContent = parseFloat(r.value).toFixed(2).replace('.', ',');
    r.addEventListener('input', () => {
      S.ajustes.libres[a.id] = parseFloat(r.value);
      l.querySelector('b').textContent = parseFloat(r.value).toFixed(2).replace('.', ',');
      pedirDibujo(true);
    });
    r.addEventListener('change', () => pedirDibujo(false));
    libres.appendChild(l);
  }
}

// ───────────────────────── dibujo ─────────────────────────

function dibujarOriginal() {
  const c = lienzoOriginal;
  // mientras se marcan o arrastran puntos, el dedo dibuja en vez de desplazar la página
  c.classList.toggle('sinGesto', !!S.modoManual || S.retocando);
  c.width = S.base.width; c.height = S.base.height;
  const x = c.getContext('2d');
  x.drawImage(S.base, 0, 0);
  if (S.modoManual) {
    dibujarMarcasManuales(x);
    return;
  }
  if (!S.rostro) return;
  // malla tenue
  x.save();
  x.fillStyle = 'rgba(90,190,255,0.5)';
  for (let i = 0; i < S.rostro.puntos.length; i += 3) {
    const p = S.rostro.puntos[i];
    x.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
  }
  // silueta
  x.strokeStyle = 'rgba(255,190,90,0.9)';
  x.lineWidth = 1.4;
  x.beginPath();
  S.rostro.ovalo.forEach((i, k) => {
    const p = S.rostro.puntos[i];
    if (k) x.lineTo(p.x, p.y); else x.moveTo(p.x, p.y);
  });
  x.closePath();
  x.stroke();
  // tiradores
  if (S.retocando) {
    for (const [nombre, indice] of Object.entries(S.rostro.refs)) {
      if (typeof indice !== 'number') continue;
      const p = S.rostro.puntos[indice];
      x.fillStyle = 'rgba(255,255,255,0.92)';
      x.strokeStyle = 'rgba(20,20,20,0.8)';
      x.lineWidth = 1.2;
      x.beginPath();
      x.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      x.fill(); x.stroke();
    }
  }
  x.restore();
  $('#etiquetaPuntos').textContent = S.retocando ? '· arrastra los puntos blancos' : '';
}

function dibujarMarcasManuales(x) {
  const { paso, marcadas } = S.modoManual;
  x.save();
  for (const [nombre, p] of Object.entries(marcadas)) {
    x.fillStyle = 'rgba(90,220,140,0.95)';
    x.beginPath(); x.arc(p.x, p.y, 4.5, 0, Math.PI * 2); x.fill();
  }
  const guia = GUIA_MANUAL[paso];
  if (guia) {
    x.fillStyle = 'rgba(0,0,0,0.65)';
    x.fillRect(0, 0, x.canvas.width, 34);
    x.fillStyle = '#fff';
    x.font = '14px ui-sans-serif, system-ui, sans-serif';
    x.textBaseline = 'middle';
    x.fillText(`${paso + 1}/${GUIA_MANUAL.length} · ${guia.texto}`, 12, 17);
  }
  x.restore();
  $('#etiquetaPuntos').textContent = guia ? 'haz clic en el punto que se pide' : '';
}

/** Geometría exagerada + imagen deformada, con caché por ajustes. */
function geometria(rapido) {
  const clave = JSON.stringify([S.ajustes, S.usarAprendido, S.aprendidos.length, rapido]);
  if (S.cache && S.cache.clave === clave) return S.cache;

  const canon = canonActivo();
  const virt = puntosVirtuales(S.rostro, S.medidas);
  const ex = exagerar(S.rostro, S.medidas, canon, S.ajustes, virt);
  const rostroEx = { ...S.rostro, puntos: ex.puntos };
  const medidasEx = medir(rostroEx);

  const { origen, destino } = controlesDesdeMalla(S.rostro, ex.puntos, virt, ex.extra);
  const ctxBase = S.base.getContext('2d');
  const fuente = ctxBase.getImageData(0, 0, S.base.width, S.base.height);
  const auxiliar = nuevoCanvas(1, 1).getContext('2d');
  const deformada = deformarImagen(fuente, origen, destino, (w, h) => auxiliar.createImageData(w, h),
    { paso: rapido ? 12 : 5 });

  // Silueta de la cabeza completa (malla + cráneo estimado) para limitar el tramado.
  // Se encoge un poco: así las rayas se quedan dentro y el contorno lo define la línea,
  // no un cerco de tramado sobre el fondo.
  const cabeza = inflar(envolvente([...rostroEx.ovalo.map((i) => ex.puntos[i]), ...ex.extra]), -2);

  S.cache = { clave, ex, rostroEx, medidasEx, deformada, cabeza, virt };
  return S.cache;
}

async function dibujar(rapido = false) {
  if (!S.rostro || !S.base) return;
  const estilo = ESTILOS[S.estilo];
  const W = S.base.width, H = S.base.height;
  lienzoCaricatura.width = W; lienzoCaricatura.height = H;
  const x = lienzoCaricatura.getContext('2d');

  const g = geometria(rapido);

  x.save();
  x.fillStyle = estilo.papel;
  x.fillRect(0, 0, W, H);

  if (S.capas.foto) {
    const mezcla = S.capas.tinta || S.capas.tramado;
    x.globalAlpha = mezcla ? 0.35 : 1;
    x.drawImage(aCanvas(g.deformada), 0, 0);
    x.globalAlpha = 1;
  }

  // escala de trabajo para el tono: la mitad basta y es mucho más rápido
  const escalaTono = rapido ? 0.4 : 0.55;
  let grisPeq = null, anchoPeq = 0, altoPeq = 0;
  if (S.capas.tinta || S.capas.tramado) {
    anchoPeq = Math.max(32, Math.round(W * escalaTono));
    altoPeq = Math.max(32, Math.round(H * escalaTono));
    const peq = nuevoCanvas(anchoPeq, altoPeq);
    const px = peq.getContext('2d');
    px.imageSmoothingQuality = 'high';
    px.drawImage(aCanvas(g.deformada), 0, 0, anchoPeq, altoPeq);
    grisPeq = aGris(px.getImageData(0, 0, anchoPeq, altoPeq));
  }

  if (S.capas.tinta) {
    const gris = aGris(g.deformada);
    const l = lineas(gris, W, H, estilo.linea || {});
    const auxiliar = nuevoCanvas(1, 1).getContext('2d');
    const img = aImageData(l, W, H, (w, h) => auxiliar.createImageData(w, h), estilo.tinta);
    x.globalCompositeOperation = 'multiply';
    x.drawImage(aCanvas(img), 0, 0);
    x.globalCompositeOperation = 'source-over';
  }

  if (S.capas.tramado && grisPeq) {
    const k = W / anchoPeq;
    const mascara = mascaraPoligono(g.cabeza.map((p) => ({ x: p.x / k, y: p.y / k })));
    const opciones = { ...(estilo.tramado || {}), mascara };
    if (rapido && opciones.pasadas === undefined) {
      opciones.pasadas = [{ umbral: 0.62, cruce: 0, largo: 2.3 }, { umbral: 0.38, cruce: 42, largo: 2.0 }];
    }
    const trazosTramado = hachuras(grisPeq, anchoPeq, altoPeq, opciones);
    x.globalCompositeOperation = 'multiply';
    x.lineCap = 'round';
    const tinta = estilo.tinta;
    for (const t of trazosTramado) {
      x.strokeStyle = `rgba(${tinta[0]},${tinta[1]},${tinta[2]},${t.alfa.toFixed(3)})`;
      x.lineWidth = t.ancho * k * 0.9;
      x.beginPath();
      x.moveTo(t.x1 * k, t.y1 * k);
      x.lineTo(t.x2 * k, t.y2 * k);
      x.stroke();
    }
    x.globalCompositeOperation = 'source-over';
  }

  let listaTrazos = null;
  if (S.capas.trazo) {
    listaTrazos = trazos(g.rostroEx);
    pintarTrazos(x, listaTrazos, { paleta: estilo.paleta });
  }

  let listaConstruccion = null;
  if (S.capas.construccion) {
    listaConstruccion = construccion(g.rostroEx, g.medidasEx);
    pintarConstruccion(x, listaConstruccion, { escala: Math.max(1, W / 700) });
  }
  x.restore();

  S.ultimo = { ...g, listaTrazos, listaConstruccion };
  dibujarOriginal();
}

let pendiente = null;
function pedirDibujo(rapido) {
  clearTimeout(pendiente);
  pendiente = setTimeout(async () => {
    trabajando(true);
    await respirar();
    try { await dibujar(rapido); } catch (e) { console.error(e); }
    trabajando(false);
  }, rapido ? 40 : 10);
}

// ───────────────────────── modo manual y retoque ─────────────────────────

function empezarManual() {
  S.modoManual = { paso: 0, marcadas: {} };
  S.retocando = false;
  $('#pistaManual').textContent = 'Haz clic en cada punto que se te pida. Retrocede con la tecla ⌫.';
  dibujarOriginal();
}

function coordenadaEnLienzo(evento, lienzo) {
  const r = lienzo.getBoundingClientRect();
  return {
    x: ((evento.clientX - r.left) / r.width) * lienzo.width,
    y: ((evento.clientY - r.top) / r.height) * lienzo.height,
  };
}

/** Empuja la malla: mueve un punto y arrastra a sus vecinos con caída suave. */
function empujar(rostro, indice, destino) {
  const origen = rostro.puntos[indice];
  const dx = destino.x - origen.x, dy = destino.y - origen.y;
  const radio = Math.max(18, rostro.ancho * 0.05);
  const puntos = rostro.puntos.map((p) => {
    const d = Math.hypot(p.x - origen.x, p.y - origen.y);
    const w = 1 / (1 + (d / radio) ** 2.4);
    return { x: p.x + dx * w, y: p.y + dy * w };
  });
  return { ...rostro, puntos };
}

lienzoOriginal.addEventListener('pointerdown', (e) => {
  if (!S.base) return;
  const p = coordenadaEnLienzo(e, lienzoOriginal);

  if (S.modoManual) {
    const guia = GUIA_MANUAL[S.modoManual.paso];
    if (!guia) return;
    S.modoManual.marcadas[guia.id] = p;
    S.modoManual.paso++;
    if (S.modoManual.paso >= GUIA_MANUAL.length) terminarManual();
    else dibujarOriginal();
    return;
  }

  if (S.retocando && S.rostro) {
    let mejor = null, mejorD = 14;
    for (const [nombre, indice] of Object.entries(S.rostro.refs)) {
      if (typeof indice !== 'number') continue;
      const q = S.rostro.puntos[indice];
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < mejorD) { mejorD = d; mejor = indice; }
    }
    if (mejor !== null) {
      S.arrastre = mejor;
      lienzoOriginal.setPointerCapture(e.pointerId);
    }
  }
});

lienzoOriginal.addEventListener('pointermove', (e) => {
  if (S.arrastre === null || S.arrastre === undefined) return;
  const p = coordenadaEnLienzo(e, lienzoOriginal);
  S.rostro = empujar(S.rostro, S.arrastre, p);
  dibujarOriginal();
});

lienzoOriginal.addEventListener('pointerup', () => {
  if (S.arrastre === null || S.arrastre === undefined) return;
  S.arrastre = null;
  S.medidas = medir(S.rostro);
  S.cache = null;
  construirAnalisis();
  pedirDibujo(false);
});

window.addEventListener('keydown', (e) => {
  if (S.modoManual && (e.key === 'Backspace' || e.key === 'Escape')) {
    e.preventDefault();
    if (e.key === 'Escape') { S.modoManual = null; dibujarOriginal(); return; }
    S.modoManual.paso = Math.max(0, S.modoManual.paso - 1);
    const guia = GUIA_MANUAL[S.modoManual.paso];
    delete S.modoManual.marcadas[guia.id];
    dibujarOriginal();
  }
});

async function terminarManual() {
  const marcadas = S.modoManual.marcadas;
  S.modoManual = null;
  S.rostro = desdeManual(marcadas, S.base.width, S.base.height);
  S.medidas = medir(S.rostro);
  S.cache = null;
  $('#estadoRostro').textContent = `Rostro marcado a mano (${Object.keys(marcadas).length} puntos).`;
  $('#estadoRostro').className = 'estado ok';
  $('#pistaManual').textContent = '';
  construirAnalisis();
  construirDeslizadores();
  mostrar('#bloqueAnalisis', true);
  mostrar('#bloqueExagerar', true);
  mostrar('#bloqueEstilo', true);
  mostrar('#bloqueExportar', true);
  trabajando(true);
  await respirar();
  await dibujar();
  trabajando(false);
}

// ───────────────────────── exportar ─────────────────────────

function nombreArchivo(ext) {
  const f = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `caricatura-${f.getFullYear()}${dos(f.getMonth() + 1)}${dos(f.getDate())}-${dos(f.getHours())}${dos(f.getMinutes())}.${ext}`;
}

function exportarPng() {
  lienzoCaricatura.toBlob((b) => descargar(nombreArchivo('png'), b), 'image/png');
}

function exportarSvg() {
  if (!S.ultimo) return;
  const estilo = ESTILOS[S.estilo];
  const lista = [...(S.ultimo.listaTrazos || trazos(S.ultimo.rostroEx))];
  if (S.capas.construccion) {
    lista.push(...(S.ultimo.listaConstruccion || construccion(S.ultimo.rostroEx, S.ultimo.medidasEx)));
  }
  const svg = trazosASvg(lista, lienzoCaricatura.width, lienzoCaricatura.height, {
    paleta: estilo.paleta,
    fondo: estilo.papel,
    colores: {
      esfera: '#2b5aa8', plano: 'rgba(43,90,168,0.5)', cruz: '#c03c28',
      mandibula: '#2b5aa8', division: 'rgba(60,60,60,0.5)', oreja: 'rgba(43,90,168,0.6)',
    },
  });
  descargar(nombreArchivo('svg'), new Blob([svg], { type: 'image/svg+xml' }));
}

/** Lámina de proceso: original, caricatura y las medidas, como una hoja de taller. */
function exportarLamina() {
  if (!S.ultimo) return;
  const alto = 1080;
  const anchoImagen = Math.round((alto - 230) * (S.base.width / S.base.height));
  const ancho = anchoImagen * 2 + 520;
  const c = nuevoCanvas(ancho, alto);
  const x = c.getContext('2d');
  x.fillStyle = '#f7f3e9';
  x.fillRect(0, 0, ancho, alto);

  x.fillStyle = '#1b1915';
  x.font = '600 34px ui-serif, Georgia, serif';
  x.fillText('Análisis del rostro y caricatura', 44, 62);
  x.fillStyle = '#6b6559';
  x.font = '15px ui-sans-serif, system-ui, sans-serif';
  x.fillText('Canon de Andrew Loomis como referencia · exageración por amplificación de la desviación (método de John Kascht)',
    44, 90);

  const y0 = 128;
  x.drawImage(S.base, 44, y0, anchoImagen, alto - 230);
  x.drawImage(lienzoCaricatura, 44 + anchoImagen + 24, y0, anchoImagen, alto - 230);
  x.strokeStyle = 'rgba(0,0,0,.18)';
  x.strokeRect(44, y0, anchoImagen, alto - 230);
  x.strokeRect(44 + anchoImagen + 24, y0, anchoImagen, alto - 230);
  x.fillStyle = '#6b6559';
  x.font = '13px ui-sans-serif, system-ui, sans-serif';
  x.fillText('Original', 44, alto - 88);
  x.fillText(`Caricatura · intensidad ${S.ajustes.intensidad.toFixed(2).replace('.', ',')}`, 44 + anchoImagen + 24, alto - 88);

  // columna de medidas
  const cx = 44 + anchoImagen * 2 + 48 + 24;
  const ds = desviaciones(S.medidas, canonActivo());
  x.fillStyle = '#1b1915';
  x.font = '600 17px ui-sans-serif, system-ui, sans-serif';
  x.fillText('Desviaciones respecto al canon', cx, y0 + 6);
  let y = y0 + 36;
  const maximo = Math.max(0.0001, ds[0].magnitud);
  for (const d of ds) {
    const t = describir(d);
    x.fillStyle = '#2a2721';
    x.font = '13.5px ui-sans-serif, system-ui, sans-serif';
    x.fillText(d.medida.etiqueta, cx, y);
    x.fillStyle = '#7a7466';
    x.font = '12px ui-sans-serif, system-ui, sans-serif';
    const pct = d.medida.tipo === 'escala' ? `${(d.relativa * 100).toFixed(0)}%`
      : d.medida.tipo === 'angulo' ? `${d.desv.toFixed(1)}°` : d.desv.toFixed(3);
    x.fillText(`${pct} · ${t.rasgo}`, cx, y + 16);
    const w = 400;
    x.fillStyle = '#e2dccd';
    x.fillRect(cx, y + 24, w, 4);
    x.fillStyle = d.desv >= 0 ? '#c8821f' : '#3f6ba8';
    x.fillRect(cx, y + 24, Math.max(2, (d.magnitud / maximo) * w), 4);
    y += 48;
  }
  c.toBlob((b) => descargar(nombreArchivo('png').replace('.png', '-lamina.png'), b), 'image/png');
}

// ───────────────────────── enlaces de la interfaz ─────────────────────────

$('#archivo').addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) cargarArchivo(e.target.files[0]);
});

const zona = $('#zonaSoltar');
['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (e) => {
  e.preventDefault(); zona.classList.add('encima');
}));
['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, () => zona.classList.remove('encima')));
zona.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) cargarArchivo(f);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) cargarArchivo(f);
});

$('#btnDemo').addEventListener('click', async () => {
  S.fuente = { tipo: 'demo' };
  const { canvas, marcadas } = dibujarRostroDePrueba(LADO);
  await usarLienzo(canvas, marcadas);
});

$('#btnManual').addEventListener('click', () => { if (S.base) empezarManual(); });
$('#btnRetocar').addEventListener('click', () => {
  S.retocando = !S.retocando;
  $('#btnRetocar').textContent = S.retocando ? 'Terminar retoque' : 'Retocar puntos';
  dibujarOriginal();
});

const rangoIntensidad = $('#intensidad');
rangoIntensidad.addEventListener('input', () => {
  S.ajustes.intensidad = parseFloat(rangoIntensidad.value);
  $('#valIntensidad').textContent = S.ajustes.intensidad.toFixed(2).replace('.', ',');
  marcarAtajo();
  pedirDibujo(true);
});
rangoIntensidad.addEventListener('change', () => pedirDibujo(false));

function marcarAtajo() {
  document.querySelectorAll('[data-intensidad]').forEach((b) => {
    b.classList.toggle('activo', Math.abs(parseFloat(b.dataset.intensidad) - S.ajustes.intensidad) < 0.03);
  });
}
document.querySelectorAll('[data-intensidad]').forEach((b) => b.addEventListener('click', () => {
  S.ajustes.intensidad = parseFloat(b.dataset.intensidad);
  rangoIntensidad.value = b.dataset.intensidad;
  $('#valIntensidad').textContent = S.ajustes.intensidad.toFixed(2).replace('.', ',');
  marcarAtajo();
  pedirDibujo(false);
}));

// estilos
const cajaEstilos = $('#estilos');
for (const [id, e] of Object.entries(ESTILOS)) {
  const b = document.createElement('button');
  b.innerHTML = '<em></em><small></small>';
  b.querySelector('em').textContent = e.nombre;
  b.querySelector('small').textContent = e.nota;
  b.classList.toggle('activo', id === S.estilo);
  b.addEventListener('click', () => {
    S.estilo = id;
    S.capas = { ...ESTILOS[id].capas };
    cajaEstilos.querySelectorAll('button').forEach((o) => o.classList.remove('activo'));
    b.classList.add('activo');
    sincronizarCapas();
    pedirDibujo(false);
  });
  cajaEstilos.appendChild(b);
}

const cajaCapas = $('#capas');
for (const [id, nombre] of Object.entries(NOMBRES_CAPA)) {
  const l = document.createElement('label');
  l.className = 'fila';
  l.innerHTML = `<input type="checkbox" data-capa="${id}"><span></span>`;
  l.querySelector('span').textContent = nombre;
  l.querySelector('input').addEventListener('change', (e) => {
    S.capas[id] = e.target.checked;
    pedirDibujo(false);
  });
  cajaCapas.appendChild(l);
}
function sincronizarCapas() {
  cajaCapas.querySelectorAll('[data-capa]').forEach((i) => { i.checked = !!S.capas[i.dataset.capa]; });
}
sincronizarCapas();

// canon aprendido
try {
  const guardado = JSON.parse(localStorage.getItem(CLAVE_CANON) || '[]');
  if (Array.isArray(guardado)) S.aprendidos = guardado;
} catch (e) { /* almacenamiento no disponible: se sigue con el canon de Loomis */ }
$('#numAprendido').textContent = String(S.aprendidos.length);

function guardarCanon() {
  try { localStorage.setItem(CLAVE_CANON, JSON.stringify(S.aprendidos)); } catch (e) { /* ignorar */ }
  $('#numAprendido').textContent = String(S.aprendidos.length);
}

$('#btnAprender').addEventListener('click', () => {
  if (!S.medidas) return;
  const limpio = {};
  for (const m of MEDIDAS) if (typeof S.medidas[m.id] === 'number') limpio[m.id] = S.medidas[m.id];
  S.aprendidos.push(limpio);
  guardarCanon();
  construirAnalisis();
  if (S.usarAprendido) { S.cache = null; pedirDibujo(false); }
});
$('#btnOlvidar').addEventListener('click', () => {
  S.aprendidos = [];
  guardarCanon();
  $('#usarAprendido').checked = false;
  S.usarAprendido = false;
  if (S.medidas) { construirAnalisis(); S.cache = null; pedirDibujo(false); }
});
$('#usarAprendido').addEventListener('change', (e) => {
  S.usarAprendido = e.target.checked && S.aprendidos.length > 0;
  e.target.checked = S.usarAprendido;
  if (S.medidas) { construirAnalisis(); S.cache = null; pedirDibujo(false); }
});

$('#btnPng').addEventListener('click', exportarPng);
$('#btnSvg').addEventListener('click', exportarSvg);
$('#btnLamina').addEventListener('click', exportarLamina);

// calidad del dibujo
const selectorCalidad = $('#calidad');
selectorCalidad.value = String(LADO);
$('#valCalidad').textContent = `${LADO} px`;
selectorCalidad.addEventListener('change', async () => {
  LADO = parseInt(selectorCalidad.value, 10);
  $('#valCalidad').textContent = `${LADO} px`;
  try { localStorage.setItem(CLAVE_CALIDAD, String(LADO)); } catch (e) { /* sin almacenamiento */ }
  await recargarFuente();
});

marcarAtajo();

// ─── instalación en el aparato ───────────────────────────────────────────────

let avisoInstalar = null;
const estadoInstalar = $('#estadoInstalar');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  avisoInstalar = e;
  $('#btnInstalar').classList.remove('oculto');
  estadoInstalar.textContent = 'Puedes instalarla como app, con su propio icono.';
});

$('#btnInstalar').addEventListener('click', async () => {
  if (!avisoInstalar) return;
  avisoInstalar.prompt();
  const { outcome } = await avisoInstalar.userChoice;
  avisoInstalar = null;
  $('#btnInstalar').classList.add('oculto');
  estadoInstalar.textContent = outcome === 'accepted'
    ? 'Instalada. Ábrela desde el icono de la pantalla de inicio.'
    : 'Puedes instalarla más tarde desde el menú del navegador.';
});

window.addEventListener('appinstalled', () => {
  estadoInstalar.textContent = 'Instalada. Ábrela desde el icono de la pantalla de inicio.';
  $('#btnInstalar').classList.add('oculto');
});

/** Pregunta algo al trabajador de servicio y espera su respuesta. */
function preguntarAlSw(mensaje, alProgreso) {
  return new Promise((resolver, rechazar) => {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) { rechazar(new Error('sin trabajador de servicio')); return; }
    const canal = new MessageChannel();
    canal.port1.onmessage = (e) => {
      const d = e.data || {};
      if (d.estado === 'progreso') { if (alProgreso) alProgreso(d); return; }
      if (d.estado === 'error') rechazar(new Error(d.mensaje));
      else resolver(d);
    };
    sw.postMessage(mensaje, [canal.port2]);
  });
}

$('#btnSinConexion').addEventListener('click', async () => {
  const boton = $('#btnSinConexion');
  boton.disabled = true;
  estadoInstalar.textContent = 'Guardando el detector (unos 16 MB)…';
  try {
    await preguntarAlSw({ tipo: 'guardar-detector' }, (p) => {
      estadoInstalar.textContent = `Guardando el detector… ${p.hechos} de ${p.total}`;
    });
    estadoInstalar.textContent = 'Listo: funciona sin conexión.';
  } catch (e) {
    estadoInstalar.textContent = `No pude guardarlo: ${e.message}`;
  } finally {
    boton.disabled = false;
  }
});

// ─── trabajador de servicio ──────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(async () => {
      await navigator.serviceWorker.ready;
      try {
        const r = await preguntarAlSw({ tipo: 'estado-detector' });
        if (r.guardado) {
          estadoInstalar.textContent = 'Guardada para usar sin conexión.';
          $('#btnSinConexion').classList.add('oculto');
        } else if (!avisoInstalar) {
          estadoInstalar.textContent = 'Puedes guardarla para usarla sin conexión.';
        }
      } catch (e) { /* aún sin controlador: se preguntará en la próxima visita */ }
    }).catch(() => { /* sin https o no soportado: la app funciona igual, solo que online */ });
  });
} else {
  estadoInstalar.textContent = 'Este navegador no permite instalarla.';
}

// Precalentar el detector. En un teléfono no: son 16 MB y quizá solo viene a mirar.
if (!esPantallaChica) {
  deteccion.cargar().catch(() => {
    $('#pistaManual').textContent = 'No pude cargar el detector automático; puedes marcar los puntos a mano.';
  });
}

// Para las pruebas automatizadas.
window.__caricatura = { S, dibujar, usarLienzo, ESTILOS };
