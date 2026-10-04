# Caricatura — método Loomis · Kascht

App local para convertir una foto en caricatura. No usa internet ni ningún servicio
externo: la foto no sale de tu computador.

## Para empezar

**En el teléfono o la tablet:** <https://gconsacs-hash.github.io/caricatura/>

Para dejarla instalada como app, con su icono y a pantalla completa:

1. Abre esa dirección en Chrome.
2. Menú ⋮ → **Añadir a pantalla de inicio** (o pulsa el botón *Instalar en el aparato*
   que aparece abajo del todo en la propia app).
3. Dentro de la app, pulsa una vez **Guardar para usar sin conexión**: baja los 16 MB del
   detector de rostros y a partir de ahí funciona sin internet, también en avión.

En iPhone es Compartir → Añadir a pantalla de inicio.

**En el computador:** doble clic en **Iniciar.cmd**. Se abre el navegador en
`http://localhost:3300`. Hace falta Node instalado; no hay que instalar ninguna librería.
Para pararlo: Ctrl+C en la ventana negra, o cerrarla.

En ambos casos la foto se procesa dentro del navegador y **no se envía a ningún sitio**.
La página solo sirve los archivos de la app; tu imagen nunca sube a GitHub ni a nada.

### Publicar una actualización

```
node herramientas\publicar.mjs
```

Sube solo lo que haya cambiado (el detector de 26 MB se reutiliza) y refresca
GitHub Pages. Requiere `gh` instalado y con sesión iniciada.

## Qué hace, y por qué así

Casi todos los "caricaturizadores" agrandan los ojos y la boca y ya. El parecido se
pierde, porque lo que identifica a una cara no son los rasgos sueltos sino sus
proporciones. Esta app sigue el camino de dos dibujantes:

**Andrew Loomis** dejó por escrito el canon de la cabeza: el ancho es 2/3 del alto, los
ojos caen a media altura, la base de la nariz a mitad de camino entre las cejas y el
mentón, la boca a un tercio de ahí al mentón, la oreja va de la ceja a la base de la
nariz, y el rostro mide cinco anchos de ojo. Ese canon está escrito como datos en
`js/canon.js` y se usa para construir un rostro de referencia.

**John Kascht** describe su método como observar hasta encontrar en qué se aparta ese
rostro concreto del rostro promedio, y empujar exactamente eso. Nunca exagera un rasgo
porque sí: exagera la *diferencia*.

Así que la app:

1. **Mide** el rostro: 17 medidas (anchos de frente, pómulos, mandíbula y barbilla;
   largos de cara, barbilla y nariz; separación, tamaño e inclinación de los ojos;
   altura e inclinación de las cejas; ancho de nariz y boca; grosor de labios; distancia
   nariz-boca; y la asimetría general). Todo en un marco normalizado que quita el tamaño
   de la foto y la inclinación de la cabeza.
2. **Compara** con el canon. Lo importante: los valores del canon no están escritos a
   mano, se obtienen midiendo el rostro de Loomis con las mismas funciones. Si cambias
   una proporción del canon, las referencias se recalculan solas.
3. **Ordena** las desviaciones por cuán raras son (cada medida sabe cuánto varía
   normalmente entre personas), y te dice qué define ese rostro.
4. **Exagera** con una sola regla:

   ```
   objetivo = canon + (medido − canon) × (1 + intensidad)
   ```

   Si tu mentón es un 12% más corto que el canon y la intensidad es 1,5, el mentón del
   dibujo será un 30% más corto. Lo que ya es normal no se toca: por eso el parecido
   aguanta aunque la deformación sea fuerte.
5. **Deforma** la foto con mínimos cuadrados móviles (Schaefer et al., 2006): sin
   triangulación y sin costuras.
6. **Dibuja**: línea de tinta sacada de la foto, tramado que envuelve el volumen, trazo
   vectorial limpio y, si quieres, la construcción de Loomis encima.

## La pantalla

- **1 Foto** — arrastra una imagen o elige el archivo. Mejor de frente y con buena luz.
  El botón *dibujo de prueba* trae un rostro dibujado con código para probar sin foto.
- **2 Rostro** — el detector pone 478 puntos. *Retocar puntos* deja arrastrarlos
  (arrastras uno y los vecinos lo acompañan). Si no encuentra la cara, te pide marcar
  22 puntos a mano.
- **3 Lo que define este rostro** — el análisis. Abajo, la tabla con todas las medidas.
- **4 Exageración** — la intensidad general y, si abres el detalle, un control por rasgo
  (0 = no toques esto). *Decisiones del dibujante* son dos controles sin medida detrás:
  la cúpula del cráneo no se ve en una foto de frente porque la tapa el pelo.
- **5 Acabado** — cuatro estilos y las capas por separado.
- **6 Guardar** — PNG, SVG del trazo (vectorial, se puede abrir en Inkscape o
  Illustrator) y una lámina de análisis con original, caricatura y medidas.

## El canon aprendido

El canon de Loomis es un ideal de dibujante, no la media de la gente real. Si marcas
*Añadir este rostro al canon* en varias caras, la app guarda sus medidas (en tu
navegador, nada sale de ahí) y puede comparar contra ese promedio en vez de contra
Loomis. Es lo que hace un caricaturista con los años: construirse su propio promedio.

## Lo que no hace

- **Perfiles y caras muy giradas.** El canon se mide de frente. Pasados unos 22° de giro
  te lo avisa; el análisis sigue funcionando pero pierde precisión.
- **La coronilla.** El pelo la tapa y la malla no llega: se estima con la regla de Loomis
  (los ojos parten la cabeza por la mitad) y se señala como estimación.
- **Medidas totalmente independientes.** Todo se mide en proporción al tamaño general
  del rostro, así que al juntar mucho los ojos, por ejemplo, el resto queda
  relativamente un poco más grande. Es inevitable al trabajar con proporciones, y es
  también lo que pasa al dibujar.
- **Gafas, barbas y flequillos** confunden al detector. Se arregla con *Retocar puntos*.

## Archivos

```
index.html          la pantalla
css/estilo.css
js/canon.js         el canon de Loomis como datos
js/rostro.js        la estructura de un rostro (malla automática o puntos a mano)
js/medidas.js       qué se mide y cuánto se desvía
js/exagerar.js      amplificación de desviaciones → deformación
js/mls.js           deformación de imagen por mínimos cuadrados móviles
js/imagen.js        línea de tinta y tramado
js/trazo.js         dibujo de línea vectorial + exportación SVG
js/loomis.js        la construcción (esfera, planos, cruz, divisiones)
js/deteccion.js     MediaPipe Face Landmarker
js/demo.js          el rostro de prueba dibujado con código
js/app.js           la interfaz
servidor.js         servidor estático (Node puro)
sw.js               trabajador de servicio: instalación y uso sin conexión
manifest.webmanifest
iconos/             iconos de la app (generados con herramientas/iconos.mjs)
herramientas/       generador de iconos y publicador a GitHub Pages
vendor/             MediaPipe: wasm + modelo, copia local
tests/              73 pruebas
```

## Pruebas

```
node tests\correr.mjs
```

Comprueban, entre otras cosas, que el canon no se desvía de sí mismo, que las medidas no
cambian al mover, girar o escalar la foto, que la desviación se multiplica realmente por
(1+k), que un rostro idéntico al canon no se deforma ni con intensidad 3, que una
intensidad bestial no hace desaparecer un rasgo, que la deformación reproduce una
semejanza exacta y que la línea de tinta no mancha las superficies lisas, ni claras ni
oscuras.

`node tests\diagnostico.mjs` imprime el canon medido y dónde cae cada banda de medición.

## Técnica

- Detección: MediaPipe Face Landmarker (478 puntos, con iris). Modelo y wasm en
  `vendor/`, ~38 MB, incluidos para que funcione sin conexión.
- Deformación: MLS variante de semejanza, evaluada en una rejilla y con interpolación
  bilineal por píxel.
- Línea: diferencia de gaussianas con umbral. Se aparta a propósito del XDoG clásico,
  que compara con un umbral absoluto de luminancia y convierte el pelo oscuro en una
  mancha; aquí se compara cada píxel con su entorno, así que solo responde a bordes.
- Tramado: dirección de las isofotas (perpendicular al gradiente) para que las rayas
  envuelvan la forma, con el tono repartido por percentiles de la propia imagen para que
  no dependa de la exposición.
