# SIM-VBG-001 — Rediseño premium de jugabilidad pixel art

- **Fecha:** 2026-07-13
- **Rama:** `codex/calidad-9-10`
- **Estado:** diseño conversacional aprobado; pendiente de revisión del documento escrito
- **Plataforma prioritaria:** escritorio y portátil
- **Dirección:** seria, humana y cinematográfica
- **Estrategia:** corte vertical premium de `SIM-VBG-001` antes de propagar patrones

## 1. Autoridad, precedencia y corrección del criterio anterior

Este documento consolida las seis secciones aprobadas por el usuario el 2026-07-13 y es la autoridad de producto para el nuevo corte vertical de jugabilidad. Las especificaciones anteriores se conservan como evidencia histórica y fuente de requisitos útiles, pero no se ejecutan acumulativamente cuando contradicen este diseño.

Orden de precedencia:

1. Petición activa del usuario.
2. Este diseño.
3. `2026-07-11-calidad-9-10-siep-design.md`, solo en seguridad, aislamiento, autoridad backend y verificaciones que no contradigan este documento.
4. Especificaciones de personajes de julio, como insumos de pipeline.
5. Especificaciones de junio, únicamente como contexto histórico.

El scorecard del 2026-07-12 demostró una base técnica sólida, pero no certificó calidad premium de juego. Sus dimensiones permitían asignar 9/10 a UX sin exigir fidelidad editor–runtime, ciclos de animación completos, sensación de control, audio, rendimiento sostenido ni una evaluación humana del juego. Por ello, su 9,25/10 no se reutiliza como nota de jugabilidad.

La regla nueva es deliberadamente más estricta: una dimensión mediocre no puede compensarse con otra excelente. Un gate bloqueante fallido limita su dimensión a 8/10 y bloquea la publicación.

## 2. Resultado que debe experimentar el jugador

El estudiante debe percibir un juego pixel art profesional, coherente y sensible, no una aplicación web con un canvas incrustado. En una sesión continua debe poder:

1. Elegir un personaje y comprobar exactamente cómo se verá.
2. Entrar a un escenario vivo, legible y cinematográficamente compuesto.
3. Moverse, girar, detenerse e interactuar con respuesta precisa.
4. Leer y tomar decisiones sin que el HUD compita con la escena.
5. Observar que los NPC recuerdan, reaccionan y cambian.
6. Equivocarse, reparar o continuar con consecuencias comprensibles.
7. Cerrar el caso con una devolución académica conectada con lo ocurrido.

La calidad no se declarará por compilación, cantidad de pruebas, capturas aisladas ni número de commits. Debe sostenerse durante una partida completa.

## 3. Alcance y no-objetivos

### 3.1 Incluido

- Editor de personaje y diez identidades base seleccionables.
- Un lenguaje pixel art común para jugador, NPC, retratos, objetos y señales visuales.
- Paridad real entre editor, lobby, runtime, diálogo y resultado.
- Movimiento, colisiones, cámara, interacción y bloqueo de input.
- Dos niveles de diálogo: ambiental y cinematográfico.
- HUD contextual con Liquid Glass controlado.
- Retirada total del Instructor guía chatbot de la experiencia del estudiante.
- Estados, comportamiento y consecuencias de NPC.
- Bucle completo de `SIM-VBG-001`, incluidas rutas de error y reparación.
- Sonido, atmósfera, accesibilidad, persistencia y recuperación.
- Descomposición de los monolitos que impiden probar y mantener esos sistemas.
- Evidencia automática, live, de rendimiento y humana.

### 3.2 Fuera del corte

- Propagar automáticamente el rediseño a otros casos.
- Rediseñar el portal administrativo o institucional.
- Paridad premium móvil; móvil conservará operabilidad y un smoke sin regresiones graves.
- Crear una nueva función de IA conversacional.
- Publicar, hacer push, merge o desplegar sin una autorización posterior y específica.
- Certificar validez clínica institucional sin revisión SME.
- Aceptar arte bruto generado por IA como asset final.

## 4. Dirección visual y sistema de personajes

### 4.1 Biblia visual obligatoria

El pixel art gobierna siluetas, personajes, retratos, objetos, iconos y marcos. Liquid Glass es un material secundario del HUD, no la identidad principal.

La biblia debe fijar antes de producir el elenco:

- cuadrícula lógica de personaje de `48×72 px` para este corte;
- proporciones humanas estilizadas y profesionales, menos chibi;
- perspectiva, línea de horizonte y punto de apoyo;
- grosor y color de contorno;
- número de escalones de sombra y luz;
- paleta maestra y subpaletas de piel, cabello y vestuario;
- dirección de iluminación;
- reglas de contraste y legibilidad;
- sombras de contacto;
- prohibición de filtrado bilineal y escalas fraccionarias.

El canvas se presenta en múltiplos enteros de la cuadrícula lógica y con nearest-neighbor. La interfaz puede adaptarse fluidamente, pero nunca debe suavizar o deformar el arte del mundo.

### 4.2 Elenco común

Habrá exactamente diez identidades base para este corte, diversas en edad aparente adulta, tono de piel, cabello, cuerpo y expresión, pero construidas con el mismo rig, métrica, sombreado, perspectiva y ritmo.

Cada identidad seleccionable debe incluir:

- `idle` de cuatro fotogramas en cuatro direcciones;
- caminar de seis fotogramas en cuatro direcciones;
- giro real entre direcciones, sin fingir una vista mediante espejado incorrecto;
- hablar e interactuar con al menos cuatro fotogramas en las cuatro direcciones;
- reacciones autoradas necesarias para el caso;
- retrato pixel art de alta resolución con estados coherentes;
- microanimación de parpadeo, respiración y habla en el retrato.

No se permite simular respiración o pasos deformando verticalmente todo el sprite. La animación nace de frames dibujados, desplazamientos de un píxel autorados y timing, no de `scaleY`, rebotes genéricos ni interpolación que derrita el píxel.

### 4.3 Personalización híbrida controlada

El usuario elige una identidad base y solo ve variantes que tengan soporte completo en editor y runtime. Para este corte se permiten cabello/color, accesorio y uniforme únicamente cuando cada combinación expuesta cuenta con frames, retrato y manifest válidos.

Una opción sin representación completa no aparece. Se eliminan tarjetas “próximamente”, controles ficticios y estados habilitados que no cambien píxeles. Si se conserva “con bata”, debe funcionar en las cuatro direcciones y en las animaciones; de lo contrario, se retira del editor hasta una rebanada posterior.

## 5. Manifiesto único y editor WYSIWYG

### 5.1 `CharacterManifestV1`

Una fuente versionada gobierna editor y runtime. Debe enlazar como mínimo:

- `characterId`, nombre y variante;
- procedencia y licencia del asset;
- hojas, dimensiones reales, grilla y pivote;
- direcciones y frames de cada animación;
- hitbox de pies y sombra;
- retratos, emociones y fallback;
- escala lógica;
- paletas y variantes permitidas;
- versión y hash de contenido.

El manifiesto existente no puede considerarse autoridad mientras declare dimensiones o expresiones distintas a los PNG y al runtime. El build abre cada imagen y falla ante rutas inexistentes, dimensiones incorrectas, grilla inválida, IDs duplicados, frames faltantes o deriva entre tipos, README y assets.

### 5.2 `AvatarRenderPlan`

Angular resuelve el perfil del usuario y entrega a Phaser un `AvatarRenderPlan` inmutable. Phaser no lee `localStorage`, no decide identidad y no combina claves mágicas. `CharacterProfileRepository` sincroniza el perfil autenticado con el backend; la caché local es secundaria, versionada y namespaced por usuario. La selección sobrevive recarga y cambio de dispositivo sin filtrarse a otra cuenta del mismo navegador.

### 5.3 Experiencia del editor

Al seleccionar una tarjeta, la vista central cambia inmediatamente al mismo asset que usará Phaser. El usuario puede:

- rotar entre frente, espalda, izquierda y derecha;
- reproducir `idle`, caminar, hablar e interactuar;
- alternar únicamente variantes completas;
- guardar, restablecer y continuar;
- volver al editor y recuperar la misma selección.

El panel no mezcla un cast horneado con un avatar modular diferente. La comparación editor → lobby → mundo → diálogo → outcome debe conservar `characterId`, cabello, tono, vestuario y expresión. La aceptación exige coincidencia de frame/hash y una comparación visual de las diez identidades.

## 6. Movimiento, cámara e interacción

### 6.1 Control

El movimiento usa una máquina de estados explícita con aceleración breve, velocidad estable y frenado corto. Debe sentirse preciso, no flotante:

- WASD, flechas y mando XInput;
- remapeo persistente y detección de conflictos;
- diagonal normalizada dentro de ±3 %;
- latencia interna input → movimiento `p95 ≤ 50 ms`;
- parada sin deslizamiento superior a 0,35 anchos de pie;
- facing estable al soltar la entrada;
- animación gobernada por velocidad real, no por tecla presionada.

Si una colisión detiene el cuerpo, las piernas pasan a reposo en un frame. La hitbox se centra en los pies y permite deslizar por esquinas sin engancharse. En cien recorridos automatizados contra muebles, puertas y bordes debe haber cero penetraciones superiores a un píxel lógico y cero bloqueos.

### 6.2 Cámara

La cámara tiene política independiente y testeable:

- seguimiento suavizado con dead zone pequeña;
- look-ahead limitado por dirección;
- zoom entero;
- estabilización en un máximo de 250 ms al detenerse;
- límites de sala autorados;
- transición de puerta con fade, ambiente y entrada controlada;
- reencuadre cinematográfico durante conversaciones importantes.

No se admite pixel swimming, oscilación, salto por respuestas de red antiguas ni revelación de zonas fuera del encuadre.

### 6.3 Interacción e input lock

Al interactuar, ambos actores se orientan en un máximo de 350 ms, hay una pausa breve y comienza el diálogo. Un único `InputLockState` bloquea simultáneamente jugador, NPC, puertas, interacción y emisión de posición durante diálogo, journal, settings, outcome o cualquier overlay modal.

La prueba E2E mantiene una dirección pulsada detrás de cada overlay y confirma que posición, animación y requests de world-state permanecen invariantes.

## 7. Diálogo, HUD y presentación narrativa

### 7.1 Dos niveles de conversación

El diálogo ambiental usa globos breves dentro del mundo para frases no decisionales. El diálogo cinematográfico se reserva para entrevistas, decisiones y beats clínicos.

Al abrir una conversación cinematográfica:

1. Los actores se orientan y el mundo bloquea locomoción.
2. La cámara reencuadra suavemente.
3. El entorno baja ligeramente su presencia.
4. El HUD secundario se repliega.
5. Aparece un marco inferior pixel art con superficie interna de cristal oscurecido.

El retrato es grande, expresivo y coherente con el sprite. Nombre y rol son visibles; la emoción no se anuncia mediante chips artificiales. `ActorPresentationState` sincroniza `speakerId`, emoción, facing, pose y estado de habla entre retrato y cuerpo, y restaura el estado al cerrar.

### 7.2 Texto y decisiones

- cuerpo de texto altamente legible; display pixel solo para nombres y etiquetas;
- typewriter de 35–45 caracteres por segundo, con pausas por puntuación;
- primera pulsación de Enter/Espacio completa la línea; la segunda avanza;
- reduced motion presenta la línea sin animación de caracteres;
- el lector de pantalla recibe la línea completa una sola vez;
- máximo cuatro opciones, completas y sin scroll inesperado;
- navegación por flechas, `1–4`, Enter y mando a través del router central;
- ninguna etiqueta, color o icono revela la opción correcta antes de elegir;
- la elección se confirma brevemente y deja espacio para la reacción;
- la devolución académica aparece después de la consecuencia, no como otro diálogo idéntico.

El typewriter es cancelable y no puede usar escrituras de scroll en cada ciclo de render. Un retrato ausente produce un fallback pixel art temático y un error observable en desarrollo, nunca un SVG genérico silencioso.

### 7.3 Liquid Glass controlado

El cristal solo vive en superficies de HUD, decisiones y diálogo. El orden visual es:

1. escenario pixel art;
2. muestra refractada del fondo;
3. superficie translúcida;
4. borde y bisel pixel art;
5. contenido nítido.

La refracción es leve y se concentra en bordes. Texto, retratos e iconos nunca reciben blur. Apertura, cierre, foco y confirmación usan ondas sobrias de 160–280 ms; no existe movimiento líquido permanente. La paleta usa índigo, azul frío y violeta contenidos.

`prefers-reduced-motion` y el toggle interno reemplazan ondas por opacidad. Cuando `backdrop-filter` o el presupuesto GPU no son suficientes, se usa un panel estático con textura, transparencia y contraste equivalentes.

### 7.4 HUD contextual

Objetivo, inventario, prompts y estado aparecen solo cuando aportan una decisión inmediata. Durante diálogo se ocultan minimapa, etiquetas y métricas secundarias. No habrá dos entradas para una misma acción.

La semántica de métricas debe ser consistente visualmente y en ARIA; no se muestra “calma restante” con una etiqueta accesible de “estrés” invertida.

### 7.5 Instructor guía chatbot

El Instructor guía desaparece de botones, HUD, menús, settings, DOM y navegación del estudiante. `app-ai-assistant` no se instancia, su chunk no se carga y no hay requests a sus endpoints durante una sesión completa.

La infraestructura backend puede permanecer dormida detrás de una feature flag apagada, sin ampliar ahora el alcance para rediseñarla. Ocultarla no autoriza a presentarla como segura o terminada.

## 8. Bucle jugable, NPC y consecuencias

### 8.1 Estructura del caso

`SIM-VBG-001` debe durar aproximadamente 15–25 minutos en una primera partida y recorrer:

1. orientación sin muro de texto;
2. observación del ambiente y lenguaje corporal;
3. interacción en orden elegido por el jugador;
4. formulación de hipótesis mediante evidencia;
5. seis decisiones clínicas existentes, presentadas como conductas plausibles;
6. consecuencias perceptibles;
7. cierre y debrief.

No hay tareas de relleno, coleccionables arbitrarios ni caminatas sin propósito. Cada objeto o interacción marcada aporta evidencia, caracterización, decisión o consecuencia.

### 8.2 Estado de NPC

Cada NPC relevante posee estado autoritativo de confianza, tensión, apertura y disponibilidad, además de un estado presentacional local de mirada, postura, facing y acción.

Los movimientos locales decorativos usan PRNG sembrado y zonas/anchors autorados; no cambian la posición interactiva autoritativa sin contrato. Los NPC no se solapan, no aparecen dentro de colisiones y no deambulan aleatoriamente sin intención.

Una decisión importante debe:

- persistir un evento idempotente;
- cambiar al menos un estado relacional;
- provocar una señal visible o sonora dentro del mismo beat;
- modificar diálogo, conducta o desenlace posterior.

Debe existir al menos una ruta de error con reparación. Equivocarse no produce un simple “fallaste”: el NPC puede cerrarse, la escena cambia y aparece una oportunidad coherente de reparar. También existe una ruta de error sin reparación que termina válidamente, sin hardlock.

La rúbrica permanece invisible durante el juego. Opciones, consecuencias y debrief requieren revisión SME antes de cualquier certificación clínica.

## 9. Sonido, atmósfera y feedback

Un único `AudioMixer` gobierna buses `music`, `ambience`, `voice/text` y `sfx`. Phaser y Angular emiten `AudioCue`; ninguno reproduce una segunda pila paralela.

Cada sala incluye:

- ambiente base;
- fuentes localizadas;
- estado musical autorado;
- superficies de paso con al menos tres variantes;
- transiciones de entrada y salida.

Los pasos se disparan por frame de contacto y deben quedar dentro de ±50 ms. No se repite el mismo sample consecutivamente en una serie de cien pasos. La música baja 6–10 dB o se retira en 250–800 ms durante una conversación sensible y vuelve sin corte.

Liquid Glass usa resonancias cristalinas y desplazamientos acuosos solo al abrir, enfocar o confirmar. No hay goteo permanente ni estética futurista.

Los controles de música, ambiente, texto y efectos son independientes y persistentes. Toda información sonora necesaria tiene equivalente visual. El modo de estímulos reducidos retira capas no esenciales sin eliminar significado.

Una captura de veinte minutos debe tener cero clipping, clicks, pops, loops evidentes o doble reproducción después de pause/resume. El pico maestro no supera `-1 dBFS`.

## 10. Arquitectura y autoridades

### 10.1 Límites

Los componentes actuales `game-world.component.ts` y `simulation-play.component.ts` no pueden seguir concentrando mundo, red, UI, audio y persistencia. La extracción se hace por autoridad:

```text
SimulationSessionFacade (Angular)
  ├─ CharacterProfileRepository
  ├─ SimulationApiRepository
  ├─ CheckpointQueue
  ├─ DialogueState
  ├─ HudState
  ├─ AudioMixer
  └─ GameWorldPort ── comandos/eventos tipados ── Phaser
                                                  ├─ PlayerController
                                                  ├─ CollisionWorld
                                                  ├─ CameraDirector
                                                  ├─ NpcController
                                                  ├─ InteractionResolver
                                                  └─ CharacterRenderer
```

Reglas:

- Angular controla shell, sesión, UI, perfil, persistencia y red.
- Phaser controla frame, render, animación, colisiones locales y cámara.
- Backend conserva autoridad sobre intento, nodo, evidencia, consecuencias y snapshot.
- Phaser no lee storage, no llama APIs y no decide progreso.
- Angular no manipula internals de Phaser ni duplica geometría.
- La comunicación usa `GameWorldCommand` y `GameWorldEvent` tipados.

### 10.2 `ScenePackageV1`

Mapa, límites, colisiones, objetos, identidades/posición/movimiento/diálogo de NPC, render metadata, audio zones y revisión/hash se publican como un paquete atómico. Editor, preview, runtime y backend consumen la misma geometría y la misma revisión.

Se elimina la divergencia entre BD, JSON estático, Tiled y colisiones hardcodeadas como fuentes competidoras. Los renderers pueden conservarse, pero reciben el paquete; no reinventan gameplay. El mapper de preview es puro, exhaustivo y cubierto por contract test.

### 10.3 Flujo de estado

1. Angular solicita un snapshot autoritativo versionado.
2. `SimulationSessionFacade` valida y normaliza la respuesta.
3. Phaser recibe proyecciones inmutables de escena y avatar.
4. El jugador genera un intent local.
5. Las acciones clínicas pasan por el gateway backend.
6. La respuesta incluye revisión y snapshot actualizados.
7. Angular reconcilia y emite cambios tipados a mundo y HUD.
8. Una respuesta obsoleta no puede sobrescribir una sala o revisión nueva.

## 11. Persistencia y recuperación

`CheckpointEnvelope` contiene revisión, `mapKey`, posición segura, personaje, evidencia, estado NPC, decisiones y clave de idempotencia.

Se guarda en beats seguros:

- pausa;
- cambio de sala;
- comienzo y fin de diálogo decisional;
- decisión confirmada;
- reparación;
- `pagehide`;
- salida segura.

La posición frecuente se coalesce en snapshot y no genera un evento clínico por cada debounce. El event log se reserva para beats significativos.

Ante offline, timeout o 5xx:

- no se confirma una consecuencia no aceptada por el servidor;
- se conserva el último snapshot y el checkpoint pendiente;
- la UI distingue `guardando`, `guardado`, `sin conexión` y `recuperado`;
- los reintentos son idempotentes;
- al reconectar no se duplican decisiones, evidencia ni penalizaciones.

Cambio de sala y requests encadenadas usan cancelación/epoch. Una respuesta tardía no puede reemplazar el mapa actual. Fallos de asset activan fallback explícito; fallos críticos del paquete de escena detienen de forma segura antes de comenzar el caso.

## 12. Accesibilidad y rendimiento

### 12.1 Accesibilidad

- contraste mínimo 4,5:1 para texto y 3:1 para controles relevantes;
- foco visible, trap correcto y restauración al mundo;
- fondo inerte durante modales;
- recorrido completo con teclado;
- soporte de mando;
- lector de pantalla que no anuncia typewriter carácter a carácter;
- reduced motion aplicado a CSS, Liquid Glass, retratos y Phaser;
- equivalentes visuales para información sonora;
- Axe serious/critical = 0 en estados dinámicos;
- prueba manual con NVDA.

### 12.2 Presupuesto objetivo

Equipo de referencia: Windows 10/11, navegador Chromium actual, CPU de cuatro núcleos, 8 GB RAM y GPU integrada equivalente a Intel UHD 620.

En una captura de veinte minutos a `1366×768`:

- mediana ≥59 FPS;
- frame time p95 ≤20 ms;
- al menos 99 % de frames bajo 33,3 ms;
- ninguna caída sostenida bajo 50 FPS por más de un segundo;
- cero freeze mayor a 100 ms durante movimiento o diálogo;
- carga hasta control jugable ≤5 s con cache caliente local.

El flujo completo también se verifica a `1600×900`. `390×844` y `412×915` mantienen smoke operativo, pero no condicionan la composición premium de escritorio.

## 13. Pipeline de assets e Higgsfield

El pipeline es:

1. biblia y hojas de concepto;
2. selección humana;
3. normalización de paleta, silueta, perspectiva e iluminación;
4. rig y frames;
5. atlas y manifiesto;
6. validación automática;
7. comparación editor/runtime;
8. revisión humana en movimiento.

Higgsfield podrá utilizarse cuando el conector esté disponible para concepto, consistencia de identidad y estudios de movimiento. El pipeline no depende de que esté conectado. Ninguna salida generada pasa directamente a producción: IoU, transparencia, colores y dimensiones son filtros previos, no sustitutos de revisión humana.

## 14. Rúbrica práctica 9/10

No existe promedio compensatorio. Las seis dimensiones deben obtener 9 o 10.

| Dimensión | Gate mínimo para 9/10 |
|---|---|
| Pixel art y personajes | Diez identidades coherentes; 100 % de paridad editor/runtime; ciclos y cuatro direcciones completos; cero deformación, blur o asset roto. |
| Movimiento, cámara e interacción | Métricas de input/FPS aprobadas; cero atrapamientos; cámara estable; input totalmente bloqueado bajo overlays. |
| Diálogo, HUD y Liquid Glass | Texto completo en ambos viewports; foco y lector correctos; cristal nítido y sobrio; chatbot ausente de DOM, bundle y red. |
| Bucle, NPC y consecuencias | Tres rutas completas —recomendada, error reparado y error no reparado—; estados persistentes; consecuencias perceptibles; cero hardlocks. |
| Audio y atmósfera | Mixer único, superficies y variación, sincronía, ducking, preferencias y sesión de veinte minutos sin defectos audibles. |
| Arquitectura, persistencia y QA | Contratos únicos, recovery sin pérdida/duplicación, todas las suites verdes, regresión visual, performance y revisión independiente. |

### 14.1 Gates globales bloqueantes

- Recorrido continuo editor → caso → outcome sin DevTools, teletransporte o recarga correctiva.
- Cero crash, excepción no controlada, 5xx inesperado o request crítico fallido fuera de las pruebas deliberadas de fault injection.
- Refresh, pausa y resume conservan personaje, posición segura, evidencia, NPC, decisiones y resultado.
- Cero P0/P1 abiertos.
- Todo el paquete de evidencia corresponde al mismo commit y a una base aislada.
- El usuario completa el caso localmente y aprueba expresamente arte, movimiento, diálogo, juego y sonido antes de publicar.

### 14.2 Validación humana

Antes de llamar al corte “candidato premium”, el usuario debe completar una partida continua. Antes de afirmar públicamente 9/10, se requieren además cinco participantes que no hayan trabajado en el proyecto:

- al menos cuatro de cinco terminan sin instrucciones externas;
- al menos cuatro de cinco califican con 4 o 5/5 coherencia visual, fidelidad del editor, control, lectura y atmósfera;
- al menos cuatro de cinco explican una relación decisión–consecuencia;
- mediana de primera partida entre 15 y 25 minutos;
- ninguna persona pierde información esencial jugando sin audio.

Si no se dispone de participantes, el software puede entregarse como candidato verificado, pero no se autoasigna una nota pública de 9/10.

## 15. Verificación y evidencia

La ejecución fresca debe incluir, sin ampliar presupuestos para esconder fallos:

- `npm run test:scripts`;
- `npm run check:backend`;
- `npm run test:backend`;
- `npm run test:frontend`;
- `npm run build:frontend`;
- `npm run test:api:e2e`;
- `npm run test:e2e`.

Playwright usa `retries=0` y cubre:

- las diez identidades y la paridad del editor;
- ruta recomendada;
- error con reparación;
- error sin reparación;
- refresh/resume;
- overlays con dirección mantenida;
- teclado, mando y reduced motion;
- viewports prioritarios;
- ausencia del chatbot;
- fault injection de offline, timeout y 5xx;
- errores de consola/red;
- estados visuales de editor, exploración, interacción, diálogo, elección, consecuencia y debrief.

El paquete final contiene commit, navegador, CPU/GPU/RAM, URL local, credenciales de prueba, videos continuos, screenshots comparables, matriz de personajes, frame times, métricas de input/audio, reportes Axe/NVDA, HAR redactado, logs de suites, resultados anonimizados de playtest y revisión SME cuando corresponda.

## 16. Orden conceptual de construcción

El plan posterior descompondrá el trabajo, pero debe respetar esta dependencia:

1. contratos, biblia visual y pipeline;
2. manifiesto, elenco y editor WYSIWYG;
3. adapter Angular–Phaser, movimiento, cámara e input lock;
4. diálogo, actor presentation y HUD Liquid Glass;
5. estado NPC, rutas y consecuencias;
6. mixer, soundscape y pulido;
7. persistencia, fault injection y optimización;
8. verificación automática, live y humana.

No se propaga nada a otros casos hasta que el corte complete los gates.

## 17. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Volumen de arte para diez personajes | Rig, timing y manifiesto compartidos; producir y aprobar primero una identidad completa antes del lote. |
| Inconsistencia de arte generativo | Higgsfield solo como insumo; normalización pixel y aprobación humana obligatorias. |
| Liquid Glass reduce FPS o legibilidad | Área limitada, animación breve, contenido fuera del blur y fallback estático. |
| Refactor rompe el caso funcional | Characterization tests, extracción incremental y gate verde después de cada frontera. |
| Backend, JSON y renderer divergen | `ScenePackageV1` atómico, revisionado y validado por contrato. |
| Guardado duplica eventos | Snapshot coalescido, idempotencia, revision y event log solo para beats. |
| Scope crece a todos los casos | `SIM-VBG-001` sigue siendo la única aceptación premium inicial. |
| Calidad clínica no revisada | No confundir calidad de software con certificación; gate SME separado. |

## 18. Definición de terminado

El corte se considera implementado únicamente cuando:

- todas las opciones visibles funcionan y producen la misma identidad en editor y juego;
- movimiento, animación, cámara, diálogo, HUD, NPC y audio cumplen sus métricas;
- los tres recorridos terminan sin hardlock;
- no hay pérdida ni duplicación ante pausa, refresh o fallos de red;
- las suites y verificaciones live salen con código 0;
- el rendimiento sostenido cumple en el equipo objetivo;
- Axe y NVDA pasan;
- no hay P0/P1;
- existe evidencia reproducible del mismo commit;
- el usuario juega la URL local y aprueba el resultado;
- solo después de esa aprobación se solicita autorización para publicar.

La aprobación de este documento autoriza crear el plan de implementación. No autoriza por sí sola merge, push, despliegue ni publicación.
