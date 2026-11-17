# Registro de cambios

La versión del programa es la de `package.json` en la raíz. Se sigue el versionado semántico: mayor, menor y parche.

## [1.1.0] — 2026-11-18

### Lo que nota un estudiante

**Salas y mundo**

- Las salas se arman por piezas: muros, pisos, muebles, objetos y puertas. La luz cambia con el día y la noche, y hay reflejos en vidrios y metales.
- Quien juega y las personas del caso proyectan su sombra según la luz que domina donde pisan.
- Quien juega y las personas del caso miran y caminan en ocho direcciones.
- El personal camina por la sala: en el caso insignia, la enfermera, el vigilante, la trabajadora social y la comisaria hacen su recorrido.
- Los muebles, objetos y herramientas de la biblioteca están rediseñados, con detalles que se mueven (vapor, gotera, ropa que se mece, teléfono que timbra). La comisaría y la universidad tienen arte nuevo.
- La cámara cambia de plano como en el cine: plano general al entrar, acercamiento al hablar y al revisar. No deja fuera al personaje, lo que tiene al alcance ni a quien habla. Hay vista cercana con la tecla Z. También encuadra la conversación con una persona del escenario.
- Un minimapa en la esquina y un plano completo con la tecla M muestran el lugar. El plano tiene una alternativa en texto.
- Las personas notan al estudiante, comentan lo que explora y miran lo que revisa.
- Al elegir una respuesta, el personaje reacciona en su sala antes de la nota de supervisión. La reacción se puede saltar y respeta el movimiento reducido. La franja de la reacción se queda a la vista mientras tiene el foco del teclado o el ratón se mueve encima, y sigue al soltarla.
- La entrada al caso es más rápida: la luz de las sombras se calcula detrás de «Antes de comenzar» y no en el primer cuadro del juego.

**Interfaz**

- Todo el juego tiene un solo estilo de pixel: la ficha del objetivo, los avisos, el aviso de puerta, la pausa, «Ir a…», las ranuras de herramientas y los rótulos del mundo.
- Las decisiones van sobre el mundo, con cuatro fichas que caben a 1366 × 768. En el teléfono el cuadro ocupa como mucho el 64 % del alto.
- Un parlamento o una consecuencia largos se leen por páginas de frases enteras, con «N de M» junto al botón; Enter pasa de página antes que de línea. El lector de pantalla recibe el texto entero.
- Ninguna letra de la interfaz del juego baja de 12 px.
- Si una voz no tiene retrato, se dibuja la cara del personaje de la sala o un retrato de reserva.
- Cuando una puerta está cerrada, el aviso dice el motivo y dónde está lo que sigue.
- «Salida segura» está siempre a la vista, también durante la reacción. Enter sobre «Salida segura» pide la pausa; no salta la reacción.
- El aviso de contenido sensible se muestra al entrar y se pliega a un chip.
- Se revisaron los textos: plurales sin «(es)» y subtítulos que dicen lo que muestran.

**Pausa, conexión y avance**

- La pausa guarda la posición. Sin red, «Salida segura» actúa en el acto y la pausa se registra cuando vuelve la conexión.
- El aviso de conexión se retira solo al volver la red y ya no tapa la pantalla de pausa.
- Una decisión que falla por la red se reenvía al volver la conexión. Recargar dentro de una conversación la reabre en su línea.
- Si el intento se reemplazó en otra pestaña u otro equipo, la pantalla lo dice en vez de pedir «Revisa tu conexión».
- Se corrigió un error que detenía el mundo después de una reacción «en crisis».

**Caso insignia SIM-VBG-002**

- Los tres capítulos se juegan en el hospital y la comisaría armados por piezas, con sus 16 decisiones y sus 7 finales.
- En el cierre, «Cómo llegaste aquí» nombra también los hitos de los que depende el final alcanzado.
- La persona clave no se repite dos veces seguidas en el cierre.
- «Elegiste:» muestra el texto corto del botón que se pulsó.
- El aviso de la segunda oportunidad dice en llano qué hacer.
- Se ajustaron la redacción y las indicaciones del caso tras una prueba simulada.
- Las competencias del resultado se llaman con sus tildes. Sus respuestas aún no declaran competencias (decisión pendiente de Psicología): el cierre del estudiante no muestra el bloque de competencias, y la docente ve en la traza por qué no hay valoración.

### Lo que nota un docente

**Crear casos**

- Puede describir un caso y la IA lo arma por etapas, con las salas por piezas del lugar elegido. La descripción no puede traer datos personales.
- Crear un caso a mano también arma las salas por piezas en casa, comisaría y universidad. Los casos ya creados no cambian. Por la API, sin el cliente, hay que mandar `porPiezas: true`.
- Una pantalla de avance dice qué parte va, cuánto lleva, qué salió y qué hacer si algo falla. Se puede cancelar o reintentar.
- La IA reacomoda la sala según cómo la docente la describe. Lo que genera lleva marca de IA y debe validarse con Psicología.

**Editor de salas**

- El editor arma salas por piezas: paleta, acabados, día y noche, ancho de la sala, y muros con puertas y ventanas.
- Las piezas se mueven por el muro con rejilla, con el ratón o el teclado, con deshacer y rehacer.
- Hay un catálogo de piezas del lugar, con muebles, objetos y herramientas. El lienzo de la sala dibuja cada pieza igual que el juego.
- Un objeto de la sala puede entregar una herramienta del caso al revisarlo («Al revisarlo, entrega la herramienta»).
- En una columna de teléfono la sala no baja de ×0,8 y se desplaza dentro de su columna.
- Las faltas de cada sala se ven en vivo, por ejemplo una puerta mal puesta, y la revisión lleva hasta la pieza.
- La docente dibuja el trayecto de una persona sobre la sala, y se valida antes de guardar.
- El plano del caso muestra cómo se conectan las salas.
- Al aceptar una escena sugerida entra completa: objetivo, pistas, requisitos, reacción y comentarios.
- «Agregar una respuesta» se apaga al llegar a cuatro (A a D).

**Ensayo**

- «Probar» abre el borrador como ensayo en el juego real, en otra pestaña.
- El panel de autora marca lo explorado y explica por qué no aparece una respuesta.
- Sus botones, casillas y selectores miden 44 px, y el selector de persona vuelve al valor del servidor si el cambio falla.
- El informe muestra las respuestas que el estudiante no llegó a ver.

**Rúbrica**

- Un caso con rúbrica propia se evalúa con la suya.

### Interno

**Contratos y datos**

- Documento `x-siep` 2.2: `mapa.estructura` con la sala por piezas, importación y guardado con recálculo de muros y puertas. Una sala con estructura no pide el `ScenarioConfig` del legado.
- El esquema 2.1 suma objetivo, pistas, reacción y comentarios por escena.
- Migraciones de `simulation`: `0035_authoring_generations` (tabla de generaciones por etapas) y `0036_scene_map_structure` (estructura del mapa de la escena). Hay que migrar antes de desplegar.
- Ruta nueva `GET /api/authoring/cases/<id>/plan`, con su auditoría declarada y en el inventario de la superficie.
- Campo aditivo `decisionReview[].chosen.label`, con el texto corto del botón elegido.
- La nueva versión de un caso conserva la estructura de cada sala.
- Reglas de validación OCL-13 a OCL-19 (salas por piezas y trayectos), con casos compartidos entre servidor y cliente.
- La rúbrica propia de un caso sembrado o importado manda sobre la básica.

**IA de autoría**

- Proveedor compatible con OpenAI (`AI_AUTHORING_PROVIDER`, `AI_AUTHORING_BASE_URL`, `AI_AUTHORING_API_KEY`), con esquema estricto y vuelta a `json_object` si el servidor lo rechaza.
- La generación por etapas usa `AI_AUTHORING_ENABLED`, `AI_AUTHORING_MODEL_GENERATE`, `AI_AUTHORING_GENERATIONS_PER_DAY`, `AI_AUTHORING_GENERATIONS_GLOBAL_PER_DAY` (tope global diario), `AI_AUTHORING_GENERATION_MAX_CALLS` y los esfuerzos por etapa.
- Python revisa el esqueleto y cada escena antes de guardarlos. El esqueleto rechazado se guarda y el reintento lo repara.
- `repair_json` es dato sensible y entra en el borrado del titular.
- La instrucción pide solo lo que cambia de la sala y el servidor lo combina con la plantilla.

**Juego, biblioteca y arte**

- El catálogo de piezas (`biblioteca/piezas`) tiene un manifiesto único con muebles, objetos y herramientas. Se regenera con `piezas_catalogo.py`; no se edita a mano. La luz de referencia congelada se recalculó con la biblioteca integrada.
- El cliente calcula la luz y la geometría de la sala con paridad píxel a píxel contra Python.
- Comando `crear_caso_desde_lugar` para sembrar un caso por piezas en una base de demo.
- El subconjunto de iconos del cliente es la misma lista de 188 que la del servidor.

**Pruebas y herramientas**

- Servidor: suite completa en 8255 passed, 4 skipped y 0 fallos al cierre del 17 de noviembre.
- Job Frontend: los 9 pasos en verde; `test:frontend` 5781/5781 al cierre. El `e2e` de CI completo dio 346 passed; sus 3 fallos se arreglaron y se repitieron en verde en la cabeza final.
- Pruebas e2e nuevas: recorrido de los tres capítulos de SIM-VBG-002 (`@demo-k1`), `autoria-sala-piezas`, `autoria-generacion`, `autoria-crear-a-mano-piezas`, ensayo de la docente y salida segura sin red.
- El recorrido de SIM-VBG-002 corre solo contra la pila viva de la demo (`SIEP_DEMO_VIVA=1`). El arnés `trayectos-captura` lleva `@captura` y sale del `e2e` de CI.
- La referencia de contratos HTTP incluye las rutas de generación y del plano.
- `npm run check:version` comprueba que todas las versiones coincidan y corre en CI. Este CHANGELOG nace con la entrega.

**Despliegue: modo aula**

- `psychosim/settings/aula.py` sirve la demo compilada por Django en una sola dirección de la red local. Se activa con variables de entorno (`SIEP_AULA_HOSTS`, `SIEP_AULA_PUERTO`); `production.py` y `local.py` no cambian.
- No hay HTTPS en el aula: cookies sin Secure y sin HSTS. Las claves del aula son propias.
- El editor ya no usa `crypto.randomUUID`, que no existe fuera de HTTPS.
- Medido con 10 estudiantes a la vez: 0 errores. Con 30 funciona, pero con esperas de uno a tres segundos.
- Solo se comprobó desde el mismo equipo; falta probar la entrada desde otro equipo de la red.

Rango: `origin/master` `ef9deb4f` … `f6f40ceb`; 463 commits sin merges.
