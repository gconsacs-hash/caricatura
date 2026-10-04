// publicar.mjs — sube la app a GitHub Pages usando la API (aquí no hay git instalado).
//
//   node herramientas\publicar.mjs
//
// Hace, en este orden: crea el repositorio si no existe, sube cada archivo como "blob",
// arma un árbol con todos, crea un commit, mueve la rama y enciende Pages.
// El testigo de acceso se pide a `gh` y no se escribe en ninguna parte.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DUENO = 'gconsacs-hash';
const REPO = 'caricatura';
const RAMA = 'main';
const DESCRIPCION = 'Caricatura - convierte una foto en caricatura midiendo el rostro contra el canon de Loomis y exagerando solo lo que se desvia (metodo Kascht). PWA sin conexion.';

const EXCLUIR = new Set(['node_modules', '.git', '.playwright-mcp', '.DS_Store', 'Thumbs.db']);

function testigo() {
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
}

const TOKEN = testigo();

async function api(ruta, opciones = {}) {
  const r = await fetch(`https://api.github.com${ruta}`, {
    ...opciones,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'caricatura-publicador',
      ...(opciones.body ? { 'content-type': 'application/json' } : {}),
      ...(opciones.headers || {}),
    },
  });
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch (e) { cuerpo = texto; }
  if (!r.ok) {
    const mensaje = cuerpo && cuerpo.message ? cuerpo.message : texto.slice(0, 300);
    const error = new Error(`${r.status} ${ruta}: ${mensaje}`);
    error.estado = r.status;
    error.cuerpo = cuerpo;
    throw error;
  }
  return cuerpo;
}

/** Lista recursiva de archivos, con la ruta relativa en formato POSIX. */
function listar(dir = RAIZ, prefijo = '') {
  const salida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUIR.has(entrada.name)) continue;
    const completa = path.join(dir, entrada.name);
    const relativa = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) salida.push(...listar(completa, relativa));
    else if (entrada.isFile()) salida.push({ ruta: relativa, completa, tamano: fs.statSync(completa).size });
  }
  return salida;
}

async function asegurarRepo() {
  try {
    const r = await api(`/repos/${DUENO}/${REPO}`);
    console.log(`repositorio existente: ${r.full_name}`);
    return r;
  } catch (e) {
    if (e.estado !== 404) throw e;
  }
  const r = await api('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: REPO,
      description: DESCRIPCION,
      homepage: `https://${DUENO}.github.io/${REPO}/`,
      private: false,
      has_issues: false,
      has_wiki: false,
      has_projects: false,
      auto_init: false,
    }),
  });
  console.log(`repositorio creado: ${r.full_name}`);
  return r;
}

async function publicar() {
  await asegurarRepo();

  // .nojekyll evita que Pages ignore archivos y acelera el despliegue
  const nojekyll = path.join(RAIZ, '.nojekyll');
  if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, '');

  const archivos = listar();
  const total = archivos.reduce((s, a) => s + a.tamano, 0);
  console.log(`${archivos.length} archivos, ${(total / 1024 / 1024).toFixed(1)} MB\n`);

  // Un repositorio recién creado no tiene ningún commit, y sobre un repositorio vacío
  // la API de blobs responde 409. Se siembra con un archivo por la API de contenidos,
  // que sí sabe crear el primer commit.
  try {
    await api(`/repos/${DUENO}/${REPO}/git/ref/heads/${RAMA}`);
  } catch (e) {
    if (e.estado !== 404 && e.estado !== 409) throw e;
    await api(`/repos/${DUENO}/${REPO}/contents/.nojekyll`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Primer commit',
        content: '',
        branch: RAMA,
      }),
    });
    console.log('repositorio sembrado con el primer commit\n');
  }

  const arbol = [];
  let subidos = 0, reutilizados = 0, bytesSubidos = 0;
  for (const a of archivos) {
    const datos = fs.readFileSync(a.completa);
    // Identificador que usa git para el contenido de un archivo. Calculándolo aquí se
    // puede saltar la subida de lo que ya está en el repositorio: sin esto, cambiar una
    // coma obligaría a volver a subir los 26 MB del detector.
    const sha = crypto.createHash('sha1')
      .update(Buffer.concat([Buffer.from(`blob ${datos.length}\0`), datos]))
      .digest('hex');

    let existe = false;
    try {
      await api(`/repos/${DUENO}/${REPO}/git/blobs/${sha}`, { headers: { accept: 'application/vnd.github.raw' } });
      existe = true;
    } catch (e) {
      if (e.estado !== 404) throw e;
    }

    if (!existe) {
      const blob = await api(`/repos/${DUENO}/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: datos.toString('base64'), encoding: 'base64' }),
      });
      arbol.push({ path: a.ruta, mode: '100644', type: 'blob', sha: blob.sha });
      subidos++;
      bytesSubidos += a.tamano;
      const mb = a.tamano / 1024 / 1024;
      console.log(`  subido  ${a.ruta.padEnd(42)} ${mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${(a.tamano / 1024).toFixed(0)} KB`}`);
    } else {
      arbol.push({ path: a.ruta, mode: '100644', type: 'blob', sha });
      reutilizados++;
    }
  }
  console.log(`\n${subidos} subidos (${(bytesSubidos / 1024 / 1024).toFixed(1)} MB), ${reutilizados} ya estaban`);

  // ¿había ya un commit en la rama?
  let padre = null;
  try {
    const ref = await api(`/repos/${DUENO}/${REPO}/git/ref/heads/${RAMA}`);
    padre = ref.object.sha;
  } catch (e) {
    if (e.estado !== 404 && e.estado !== 409) throw e;
  }

  console.log('\narmando el árbol…');
  const nuevoArbol = await api(`/repos/${DUENO}/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: arbol }),
  });

  const commit = await api(`/repos/${DUENO}/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: padre ? 'Actualiza la app' : 'Caricatura: metodo Loomis y Kascht, PWA sin conexion',
      tree: nuevoArbol.sha,
      parents: padre ? [padre] : [],
    }),
  });
  console.log(`commit ${commit.sha.slice(0, 7)}`);

  if (padre) {
    await api(`/repos/${DUENO}/${REPO}/git/refs/heads/${RAMA}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } else {
    await api(`/repos/${DUENO}/${REPO}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${RAMA}`, sha: commit.sha }),
    });
  }
  console.log(`rama ${RAMA} actualizada`);

  // encender GitHub Pages
  try {
    await api(`/repos/${DUENO}/${REPO}/pages`, {
      method: 'POST',
      body: JSON.stringify({ source: { branch: RAMA, path: '/' } }),
    });
    console.log('Pages activado');
  } catch (e) {
    if (e.estado === 409) console.log('Pages ya estaba activado');
    else throw e;
  }

  console.log(`\n  https://${DUENO}.github.io/${REPO}/\n`);
}

publicar().catch((e) => {
  console.error('\nFALLÓ:', e.message);
  process.exitCode = 1;
});
