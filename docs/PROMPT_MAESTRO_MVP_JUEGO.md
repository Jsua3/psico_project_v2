# PROMPT MAESTRO - MVP JUEGO SIEP

Este prompt esta dirigido a una IA de codigo que trabajara directamente en el repositorio `D:\Sua_Files\IdeaProjects\psico_project_v2`. Tu tarea no es hacer cambios esteticos superficiales. Tu tarea es rescatar el simulador y convertirlo en un MVP jugable, verificable y presentable.

El objetivo final es que el juego SIEP deje de sentirse como un dashboard con un canvas aplastado y pase a sentirse como una experiencia de simulacion psicosocial con interfaz de juego, una escena clara, avatar coherente, HUD limpio, decisiones formativas y una vertical slice completa.

## 1. Contexto obligatorio del proyecto

Stack actual:

- Frontend: Angular 21.
- Runtime del juego: Phaser.
- Backend activo: Django.
- El backend y el esquema de datos no deben tocarse salvo que sea estrictamente necesario para completar la vertical slice.
- No hagas migraciones de base de datos sin necesidad real y sin justificarlo.
- El juego se prueba localmente en el frontend Angular, normalmente en `http://127.0.0.1:4201`.
- El simulador principal se encuentra en `frontend/src/app/features/simulator/`.
- El editor de personaje se encuentra en `frontend/src/app/features/character/`.
- Los escenarios JSON estan en `frontend/src/assets/game/scenarios/`.
- Los assets modulares de personaje estan en `frontend/src/assets/characters/modular/`.

Credenciales locales utiles para pruebas:

- Usuario estudiante: `estudiante@psychosim.edu.co`
- Password: `Estudiante123!`

Pantalla prioritaria para validar:

- Ruta del editor de personaje: `/portal/personaje`
- Ruta del simulador: `/portal/simulador/1`

Captura actual de referencia del problema:

- `docs/audit-authored-clinic-after-zoom-2026-06-09.png`

Documentos relevantes:

- `docs/PROMPT_MAESTRO.md`
- `docs/PLAN_MAESTRO_EJECUCION_V3.md`
- `docs/superpowers/specs/2026-06-08-hud-redesign-design.md`
- `docs/superpowers/specs/2026-06-05-game-2_5d-depth-engine-design.md`
- `docs/superpowers/plans/2026-06-08-hud-redesign.md`

Nota importante: en este checkout no existe actualmente la carpeta `docs/interfaces`. Si la esperas y no esta, no inventes que existe. Usa como guia visual la descripcion de este documento, el spec del HUD y las capturas auditadas. Si mas adelante el usuario agrega `docs/interfaces`, esas imagenes pasan a ser la referencia visual principal.

## 2. Diagnostico actual

El problema no es uno solo. Hay varios problemas encadenados que hacen que el juego se vea viejo, apretado y poco profesional.

### 2.1 El rediseno de HUD esta documentado, pero no esta aplicado de verdad

El archivo `docs/superpowers/specs/2026-06-08-hud-redesign-design.md` describe una arquitectura correcta:

- Barra superior compacta.
- Zona central dominada por el canvas.
- Dock inferior de herramientas.
- Salida segura integrada abajo.
- Panel derecho solo cuando corresponde.
- Diario y resultados como overlays.
- Menos elementos fijos flotando sin jerarquia.

Pero el runtime actual en `frontend/src/app/features/simulator/simulation-play.component.ts` todavia conserva elementos viejos:

- `.simulator-hero`
- `.support-panel`
- `app-minimap.minimap-layer`
- `.controls-hint`
- `.journal-toggle`
- `.safe-exit-btn`
- `app-game-world.game-layer`
- `app-tool-inventory.tools-layer`

Tambien conserva posicionamiento absoluto y fijo:

- `.game-container { position: fixed; }`
- `.simulator-hero { position: absolute; }`
- `.support-panel { position: absolute; }`
- `.game-layer { position: absolute; }`
- `.tools-layer { position: absolute; }`
- `.journal-toggle { position: absolute; }`
- `.safe-exit-btn { position: absolute; }`

Este es el principal bloqueo visual. Mientras el layout siga hecho con capas absolutas superpuestas, el juego seguira viendose apretado y roto.

### 2.2 El canvas no es protagonista

En la captura actual el juego se ve asi:

- Un hero grande arriba ocupa demasiado espacio.
- Un panel derecho permanente invade el foco visual.
- El canvas queda encajonado y reducido.
- La informacion se duplica entre hero, HUD interno y panel lateral.
- La escena no respira.
- El jugador no percibe una pantalla de juego, sino una pagina administrativa.

Para un MVP, el canvas debe ser el protagonista. La interfaz debe apoyar el gameplay, no competir con el.

### 2.3 La escena ya no carga el mapa viejo como antes, pero sigue sin alcanzar calidad MVP

Se corrigio parcialmente el problema de que el juego cargara una version vieja del mapa. Ahora `SimulationPlayComponent` pasa `ScenarioConfig` hacia `GameWorldComponent`, y el runtime puede usar una sala autoria/procedural para el caso actual.

Pero la escena todavia se ve insuficiente:

- El espacio se siente improvisado.
- Hay props muy grandes o mal proporcionados.
- La perspectiva 2.5D no esta bien conseguida.
- La iluminacion tapa partes importantes.
- Los textos dentro de la escena se sienten pegados encima y no integrados.
- El entorno no tiene la calidad visual de las referencias.
- La camara y el escalado todavia no favorecen una composicion clara.

Esto debe tratarse como una vertical slice visual, no como un mapa generico.

### 2.4 Phaser todavia usa sprites Kenney para los personajes

En `frontend/src/app/features/simulator/game-world.component.ts` todavia se cargan y usan assets de Kenney:

- `/assets/game/kenney/rpg-urban-pack/Spritesheet/tilemap_packed.png`
- `KenneyCharFrames.PLAYER_IDLE`
- `KenneyCharFrames.PLAYER_WALK_DOWN`
- `KenneyCharFrames.PLAYER_WALK_LEFT`
- `KenneyCharFrames.PLAYER_WALK_RIGHT`
- `KenneyCharFrames.PLAYER_WALK_UP`
- `KenneyCharFrames.NPC_PATIENT_IDLE`
- `KenneyCharFrames.NPC_SUPERVISOR_IDLE`

Esto rompe la coherencia visual con el editor de personaje. El usuario ya pidio personajes mas simples, modulares y armados por partes: cuerpo, cara y pelo.

### 2.5 El avatar modular existe, pero solo en el editor

Ya existen assets modulares en:

- `frontend/src/assets/characters/modular/body/body_orientadora_purple.png`
- `frontend/src/assets/characters/modular/face/face_neutral.png`
- `frontend/src/assets/characters/modular/face/face_calm.png`
- `frontend/src/assets/characters/modular/face/face_worried.png`
- `frontend/src/assets/characters/modular/hair/hair_short_black_back.png`
- `frontend/src/assets/characters/modular/hair/hair_short_black_front.png`

El editor de personaje usa esos assets en un preview DOM, pero el runtime Phaser no los usa como jugador. Para el MVP, la configuracion visual elegida en el editor debe verse tambien dentro del juego.

### 2.6 Hay riesgo de assets/audio mal cableados

En pruebas anteriores aparecieron rutas de audio faltantes tipo:

- `assets/audio/music/siep_ambient.ogg`
- `assets/audio/sfx/...`

Pero los assets reales disponibles estan en rutas como:

- `frontend/src/assets/game/audio/`
- `frontend/src/assets/game/kenney/ui-audio/Audio/`

Para el MVP no debe haber errores 404 de assets locales importantes. Si falta musica, desactiva la carga o apunta a un asset existente. No dejes requests rotos.

### 2.7 Los archivos principales concentran demasiada responsabilidad

El simulador tiene archivos demasiado grandes:

- `frontend/src/app/features/simulator/simulation-play.component.ts`
- `frontend/src/app/features/simulator/game-world.component.ts`

No intentes resolver todo con mas codigo pegado en esos mismos archivos. Extrae helpers cuando reduzcan complejidad real:

- Calculo de `viewMode`.
- Render de sala clinica autoria.
- Composicion de avatar para Phaser.
- Resolucion de assets de escenario.
- Mapeo de estado de gameplay a HUD.

## 3. Decision tecnica: no migrar a Babylon para el MVP

El usuario investigo que Babylon.js podria ser una opcion para 2.5D/3D. Para el MVP actual, NO migres a Babylon.

Razon:

- El proyecto ya tiene Phaser integrado.
- El problema actual no es que Phaser no pueda hacer el MVP.
- El problema actual es layout, direccion visual, integracion de assets, camara, escala, HUD, y vertical slice.
- Migrar a Babylon ahora aumentaria el riesgo, romperia integracion existente y retrasaria el MVP.
- Phaser puede lograr un 2.5D falso suficiente con perspectiva dibujada, Y-sort, capas, profundidad, sombras, occlusion parcial y camara bien compuesta.

Babylon queda como decision posterior, solo si despues del MVP se decide reconstruir el runtime con modelos 3D o una escena 3D real.

Para este MVP, implementa un "2.5D falso" bien hecho en Phaser.

## 4. Definicion de MVP

El MVP del juego SIEP existe solo si se cumplen estas condiciones:

1. El usuario puede entrar, ir al editor de personaje, personalizar un avatar basico y verlo reflejado en el juego.
2. El usuario puede abrir `/portal/simulador/1` y ver una pantalla de juego limpia, no un dashboard apretado.
3. El canvas ocupa el foco visual principal.
4. El HUD esta organizado como juego: barra superior, objetivo discreto, dock inferior, salida segura, contexto y panel derecho solo cuando corresponde.
5. La escena del primer caso se ve coherente: sala clinica/oficina de urgencias con perspectiva 2.5D falsa, proporciones legibles, profundidad y puntos interactivos claros.
6. El jugador se mueve, cambia orientacion y no parece un sprite generico desconectado del editor.
7. Hay al menos una vertical slice jugable del caso 1: exploracion, interaccion, decision, reflexion/bitacora y salida o resultado.
8. No hay errores criticos de consola ni 404 de assets locales clave.
9. Desktop y mobile tienen layouts usables.
10. Hay capturas guardadas que demuestran el antes/despues.

No es MVP si:

- Solo se cambio CSS superficial.
- El HUD viejo sigue escondido o superpuesto.
- La escena sigue cargando una version vieja o generica.
- El avatar modular solo se ve en el editor.
- El panel derecho permanente aplasta el canvas.
- La interfaz sigue pareciendo una pagina administrativa.
- Los tests pasan pero la pantalla real se ve rota.

## 5. Direccion visual obligatoria

El objetivo visual viene de las referencias del usuario:

- Pixel art oscuro, clinico y academico.
- UI de juego con bordes pixelados, acentos violeta/lavanda, tarjetas compactas y jerarquia clara.
- Logo SIEP visible pero no invasivo.
- Barra superior con caso, progreso, estres, puntaje y acciones.
- Escena con cuarto 2.5D/isometrico falso, paredes visibles, piso en perspectiva, mobiliario clinico, iluminacion calida/fria controlada.
- Dialogos y decisiones integrados como panel de juego, no como sidebar administrativo permanente.
- Dock inferior de herramientas con icono, nombre corto, nivel/atajo y estado activo.
- Salida segura presente pero contenida, no flotando encima del mapa sin orden.
- Diario/reflexion y resultado final como paneles grandes sobre la escena, con fondo atenuado.

Evita:

- Hero marketing dentro del gameplay.
- Panel derecho permanente cuando no hay dialogo.
- Tarjetas enormes que reduzcan el canvas.
- Textos grandes pegados encima del mapa.
- Minimap fijo si no aporta al MVP.
- Controles de ayuda flotantes que tapen el juego.
- Layout con elementos absolutos compitiendo entre si.

## 6. Arquitectura de pantalla requerida

Reescribe el layout de `SimulationPlayComponent` para que tenga esta estructura mental:

```text
game-container
  top-bar
    SimulationHudComponent

  main-zone
    canvas-zone
      objective-card
      app-game-world
    right-panel-zone
      DialoguePanelComponent solo en modo dialogue-right

  bottom-zone
    safe-exit block
    ToolInventoryComponent horizontal
    context-bar

  overlays
    JournalPanelComponent cuando viewMode === journal
    Outcome/complete overlay cuando viewMode === outcome
    AI/social map overlays si existen
```

Reglas:

- `game-container` usa CSS Grid.
- No uses el hero actual como parte del gameplay.
- No mantengas `support-panel` como panel permanente.
- No dejes `app-minimap.minimap-layer` fijo encima del canvas.
- No dejes `.controls-hint` flotante encima del juego.
- No dejes `.journal-toggle` flotante; la bitacora se abre desde top bar o dock.
- No dejes `.safe-exit-btn` absoluto; la salida segura vive en bottom-zone izquierda.
- El panel derecho solo existe en el DOM cuando `viewMode === 'dialogue-right'`.
- En modo exploracion, el canvas usa todo el ancho disponible.
- En modo dialogo lateral, `main-zone` puede pasar a `grid-template-columns: 1fr clamp(340px, 28vw, 480px)`.
- En mobile, el panel de dialogo se convierte en bottom sheet.

Estados sugeridos de vista:

```ts
type SimulationViewMode =
  | 'explore'
  | 'dialogue-right'
  | 'dialogue-cinematic'
  | 'journal'
  | 'outcome';
```

`viewMode` debe derivarse del estado real:

- `outcome`: intento completado o salida segura.
- `journal`: bitacora abierta.
- `dialogue-right`: hay decision/dialogo activo que requiere panel lateral.
- `dialogue-cinematic`: dialogo importante que usa panel inferior grande.
- `explore`: estado normal de navegacion.

## 7. Orden de implementacion obligatorio

No implementes en orden aleatorio. Sigue estas fases.

### Fase 0 - Seguridad y baseline

Antes de tocar codigo:

1. Ejecuta `git status --short`.
2. Identifica cambios existentes y no los reviertas.
3. Ejecuta `npm run build`.
4. Ejecuta `npx jest --watch=false`.
5. Levanta o usa el servidor local.
6. Captura pantalla actual de `/portal/simulador/1`.
7. Guarda la captura en `docs/audit-mvp-game-YYYY-MM-DD/00-before.png`.

Si build o tests fallan antes de tus cambios, documenta el fallo exacto antes de modificar.

### Fase 1 - Reescritura real del layout del gameplay

Archivo principal:

- `frontend/src/app/features/simulator/simulation-play.component.ts`

Objetivo:

- Convertir la pantalla en un layout de juego basado en CSS Grid.
- Eliminar la arquitectura vieja de capas absolutas.

Acciones:

1. Elimina del template de gameplay:
   - `.simulator-hero`
   - `.support-panel`
   - `app-minimap.minimap-layer` como elemento fijo
   - `.controls-hint`
   - `.journal-toggle`
   - `.safe-exit-btn` absoluto
2. Reubica la informacion:
   - Titulo del caso, etapa, progreso, estres y puntaje van a `SimulationHudComponent`.
   - Objetivo actual va a una tarjeta compacta sobre el canvas, top-left.
   - Narrativa del escenario va al panel derecho solo cuando aporta a decision/dialogo, o a un overlay de detalles si se necesita.
   - Trazabilidad/bitacora va al journal overlay.
   - Recursos de apoyo van al journal o a un overlay de ayuda, no al panel permanente.
3. Implementa `viewMode` con Angular signals/computed.
4. Usa `[attr.data-mode]="viewMode()"` en el contenedor raiz.
5. Define CSS Grid:
   - fila superior compacta
   - zona central flexible
   - fila inferior compacta
6. En `explore`, la zona central debe ser casi todo canvas.
7. En `dialogue-right`, agrega columna derecha.
8. En mobile, convierte panel derecho en bottom sheet.

Criterio de aceptacion:

- Al abrir `/portal/simulador/1`, el usuario no ve un hero grande de pagina.
- El canvas es la superficie dominante.
- No hay panel derecho permanente si no hay dialogo/decision activa.
- No hay elementos flotantes tapando arbitrariamente el mapa.

### Fase 2 - HUD compacto y coherente

Archivos:

- `frontend/src/app/features/simulator/simulation-hud.component.ts`
- `frontend/src/app/features/simulator/tool-inventory.component.ts`
- `frontend/src/app/features/simulator/dialogue-panel.component.ts`
- `frontend/src/app/features/simulator/journal-panel.component.ts`

Objetivo:

- Hacer que el HUD se parezca a las referencias de juego SIEP.

SimulationHudComponent debe:

- Mostrar logo/marca SIEP compacto.
- Mostrar caso actual.
- Mostrar etapa actual.
- Mostrar progreso.
- Mostrar estres/tension verbal si existe.
- Mostrar puntaje.
- Exponer acciones:
  - abrir bitacora
  - abrir mapa/flujo social si existe
  - abrir configuracion/ayuda si existe
- No duplicar objetivo actual si ya esta en el canvas.

ToolInventoryComponent debe:

- Ser un dock horizontal inferior.
- Tener cards compactas de herramienta.
- Mostrar icono, nombre corto, descripcion corta, atajo o nivel.
- Resaltar `selectedToolCode`.
- Permitir scroll horizontal si faltan pixeles, sin romper el layout.
- Integrar la salida segura como bloque separado a la izquierda, no como card comun.

DialoguePanelComponent debe:

- Mantener modo cinematico inferior si ya existe y funciona.
- Agregar modo lateral para `dialogue-right`.
- No estar siempre visible.
- No tapar el canvas si el usuario esta explorando.
- Mostrar actor, texto, opciones, recomendada/prohibida si el modelo lo permite.

JournalPanelComponent debe:

- Ser overlay centrado o modal ancho.
- No vivir como sidebar permanente.
- Tener boton claro para continuar simulacion.
- Mostrar reflexion, eventos clave, competencias y recursos si existen.

Criterio de aceptacion:

- No hay duplicacion absurda de informacion.
- La UI se entiende como HUD de juego.
- En una captura 1366x768 no se ve apretado.
- En mobile no se superponen textos ni botones.

### Fase 3 - Escena Phaser 2.5D falsa para vertical slice

Archivo principal:

- `frontend/src/app/features/simulator/game-world.component.ts`

Helpers recomendados:

- `frontend/src/app/features/simulator/authored-clinical-room.util.ts`
- `frontend/src/app/features/simulator/clinical-room-renderer.ts`
- `frontend/src/app/features/simulator/phaser-avatar-renderer.ts`

Objetivo:

- Lograr una primera sala jugable y visualmente coherente para el caso 1.
- No intentar construir todos los mapas del sistema.
- Pulir una vertical slice.

Reglas:

- Mantener Phaser para el MVP.
- No migrar a Babylon.
- Usar 2.5D falso: profundidad por Y-sort, paredes/piso en perspectiva, sombras, occlusion y capas.
- El jugador debe poder caminar sin perderse.
- Los props no deben tener tamanos absurdos.
- Los textos diegeticos del mapa deben ser pocos y legibles.
- La camara debe encuadrar una sala coherente.
- La iluminacion no debe ocultar el gameplay.

Recomendacion:

- Mantener resolucion interna manejable para Phaser, pero ajustar camara/zoom para que el canvas se vea nitido y centrado.
- Si el mapa actual se dibuja proceduralmente, extrae ese render a un helper y limpia proporciones.
- Si se crea un background pixel art para la sala, usalo como base y coloca colliders/interactivos encima.
- No vuelvas al tilemap viejo para `urgencias-crisis` si ya se esta usando la sala autoria.

La sala MVP debe tener:

- Entrada o zona inicial clara.
- Mostrador/escritorio o area principal de atencion.
- Paciente/familia o actor clave.
- Recurso interactivo principal.
- Ruta o salida.
- 3 a 5 puntos interactivos, no mas.
- Colisiones basicas.
- Orden de profundidad: objetos de fondo atras, personajes por Y, objetos frontales delante.

Criterio de aceptacion:

- La captura se siente como una escena de juego, no como un collage.
- El jugador puede moverse y ubicarse.
- La escala de personajes y muebles es consistente.
- El mapa no tiene labels gigantes tapando el jugador.
- El render no muestra el viejo hospital/tilemap generico.

### Fase 4 - Avatar modular dentro de Phaser

Archivos:

- `frontend/src/app/features/character/avatar-figure.component.ts`
- `frontend/src/app/features/character/character-editor.component.ts`
- `frontend/src/app/features/simulator/game-world.component.ts`
- Nuevo helper recomendado: `frontend/src/app/features/simulator/phaser-avatar-renderer.ts`

Objetivo:

- El avatar que se ve en el editor debe verse tambien en el juego.

Assets existentes:

- Cuerpo: `assets/characters/modular/body/body_orientadora_purple.png`
- Cara: `assets/characters/modular/face/*.png`
- Pelo: `assets/characters/modular/hair/*.png`

Reglas:

- El personaje debe estar armado por capas: cuerpo, cara, pelo atras/frente si aplica.
- No uses sprites desagradables o ajenos al estilo.
- Si solo hay frames frontales buenos, usa animacion minima:
  - idle
  - walk down
  - walk up/back si existe
  - walk side usando mirror para derecha/izquierda
- No necesitas muchas animaciones. Necesitas suficientes para que el juego se sienta vivo y no roto.
- Si falta pelo mirando a derecha, usa flip horizontal de la vista lateral izquierda, siempre que no tenga texto o asimetria que lo haga incorrecto.
- Si la composicion por capas en Phaser es compleja, genera una textura compuesta en runtime con `RenderTexture` o canvas auxiliar y usala como sprite.

Persistencia:

- Revisa primero si ya existe store/localStorage/backend para la configuracion del avatar.
- Si existe, usalo.
- Si no existe, implementa una persistencia minima local para MVP.
- No introduzcas una migracion backend solo para esto si no es necesaria.

Criterio de aceptacion:

- Cambiar pelo/cara/uniforme en `/portal/personaje` cambia lo que aparece en `/portal/simulador/1`.
- El jugador ya no usa `KenneyCharFrames.PLAYER_IDLE` como sprite visible principal.
- El avatar no se deforma ni se ve borroso.
- El avatar respeta direccion basica al moverse.

### Fase 5 - Limpieza de assets y audio

Archivos a revisar:

- Servicios/directivas de audio del simulador.
- Cualquier loader de Phaser.
- Rutas bajo `frontend/src/assets/game/audio/`.
- Rutas bajo `frontend/src/assets/game/kenney/ui-audio/Audio/`.

Objetivo:

- Eliminar 404 de assets locales.

Acciones:

1. Busca referencias a `assets/audio/`.
2. Verifica que cada archivo exista.
3. Si no existe, apunta a un asset real o desactiva esa carga.
4. No hagas request a musica inexistente.
5. Mantiene SFX basicos si hay assets disponibles.

Criterio de aceptacion:

- Al abrir el simulador no hay 404 de audio/sprites/maps locales en consola.
- Los assets faltantes no bloquean la experiencia.

### Fase 6 - Vertical slice jugable

Caso prioritario:

- `urgencias-crisis`
- Ruta: `/portal/simulador/1`
- Nombre visible actual: `Violencia Familiar y Tentativa de Feminicidio`
- Nodo inicial: `Sala de urgencias: primera escucha`

Objetivo:

- Un usuario debe poder probar una experiencia minima completa.

Flujo minimo:

1. Entrar al portal.
2. Personalizar avatar basico.
3. Iniciar o continuar simulacion.
4. Ver escena de urgencias coherente.
5. Mover jugador.
6. Acercarse a actor/recurso.
7. Abrir interaccion con `E` o accion equivalente.
8. Elegir una decision.
9. Ver feedback o trazabilidad.
10. Abrir bitacora/reflexion.
11. Continuar o salir de forma segura.
12. Llegar a un resultado o estado final comprensible.

Si el caso completo tiene 6 escenarios y no hay tiempo, no intentes pulir los 6. Pule uno completo y deja los demas como rutas navegables sin romper.

Criterio de aceptacion:

- La vertical slice del primer escenario se puede demostrar sin explicar excusas.
- Si algo queda fuera del MVP, queda documentado como pendiente, no escondido.

## 8. Archivos que probablemente debes tocar

Prioridad alta:

- `frontend/src/app/features/simulator/simulation-play.component.ts`
- `frontend/src/app/features/simulator/simulation-hud.component.ts`
- `frontend/src/app/features/simulator/tool-inventory.component.ts`
- `frontend/src/app/features/simulator/dialogue-panel.component.ts`
- `frontend/src/app/features/simulator/journal-panel.component.ts`
- `frontend/src/app/features/simulator/game-world.component.ts`
- `frontend/src/app/features/character/avatar-figure.component.ts`
- `frontend/src/app/features/character/character-editor.component.ts`

Helpers recomendados:

- `frontend/src/app/features/simulator/simulation-view-mode.util.ts`
- `frontend/src/app/features/simulator/clinical-room-renderer.ts`
- `frontend/src/app/features/simulator/phaser-avatar-renderer.ts`
- `frontend/src/app/features/simulator/scenario-config-assets.util.ts`

Tests recomendados:

- `frontend/src/app/features/simulator/simulation-view-mode.util.spec.ts`
- `frontend/src/app/features/simulator/clinical-room-renderer.spec.ts`
- `frontend/src/app/features/simulator/phaser-avatar-renderer.spec.ts`
- `frontend/src/app/features/character/avatar-figure.component.spec.ts`
- Tests existentes actualizados, no borrados sin motivo.

Evita tocar:

- Migraciones backend.
- Esquema de base de datos.
- Contratos API si no es imprescindible.
- Autenticacion.
- Areas no relacionadas con el simulador/editor.

## 9. Reglas estrictas de implementacion

1. No reviertas cambios del usuario.
2. No uses `git reset --hard`.
3. No borres archivos sin verificar quien los usa.
4. No metas una segunda UI encima de la vieja.
5. No dejes elementos viejos ocultos con `display:none` si ya no pertenecen al layout.
6. No llames "2.5D" a una escena plana sin profundidad, occlusion ni composicion.
7. No cambies a Babylon para el MVP.
8. No aceptes que "build pasa" sea suficiente.
9. No declares exito sin capturas reales.
10. No priorices todos los casos; prioriza una vertical slice excelente.
11. No rompas mobile.
12. No dejes rutas de assets rotas.
13. No conviertas el gameplay en una landing page.
14. No uses textos visibles para explicar controles si la UI puede integrarlos de forma limpia.
15. No dupliques la misma informacion en hero, topbar, sidebar y canvas.

## 10. Verificacion obligatoria

Al final de la implementacion, ejecuta:

```powershell
npm run build
npx jest --watch=false
```

Tambien ejecuta una verificacion visual con navegador local:

1. Login con `estudiante@psychosim.edu.co` / `Estudiante123!`.
2. Abrir `/portal/personaje`.
3. Cambiar una opcion visible del avatar.
4. Abrir `/portal/simulador/1`.
5. Confirmar que el avatar aparece en el juego.
6. Confirmar que el HUD no esta duplicado.
7. Confirmar que el canvas domina la pantalla.
8. Confirmar que no aparece el mapa viejo.
9. Confirmar que el panel derecho no es permanente en exploracion.
10. Interactuar con al menos un actor/recurso.
11. Abrir bitacora.
12. Probar salida segura o resultado.

Capturas requeridas:

- `docs/audit-mvp-game-YYYY-MM-DD/00-before.png`
- `docs/audit-mvp-game-YYYY-MM-DD/01-character-editor.png`
- `docs/audit-mvp-game-YYYY-MM-DD/02-game-explore-desktop.png`
- `docs/audit-mvp-game-YYYY-MM-DD/03-game-dialogue-desktop.png`
- `docs/audit-mvp-game-YYYY-MM-DD/04-journal-overlay.png`
- `docs/audit-mvp-game-YYYY-MM-DD/05-mobile-explore.png`
- `docs/audit-mvp-game-YYYY-MM-DD/06-mobile-dialogue.png`

Viewports minimos:

- Desktop grande: `1600x900`
- Desktop comun: `1366x768`
- Mobile: `390x844`

Consola:

- No debe haber errores criticos.
- No debe haber 404 de assets locales esenciales.
- Si queda un warning no bloqueante, documentalo.

## 11. Criterios finales de aceptacion

La tarea esta terminada solo si puedes responder con evidencia:

- Build verde.
- Tests verdes.
- Capturas guardadas.
- Ruta `/portal/personaje` funcional.
- Ruta `/portal/simulador/1` funcional.
- HUD reestructurado sin layout viejo dominante.
- Canvas como protagonista.
- Panel derecho condicional.
- Dock inferior funcional.
- Bitacora como overlay.
- Salida segura integrada abajo.
- Escena inicial con 2.5D falso creible.
- Avatar modular visible en Phaser.
- Sin mapa viejo en el caso 1.
- Sin 404 criticos de assets locales.
- Una vertical slice del primer caso demostrable.

## 12. Reporte final que debes entregar

Cuando termines, entrega un reporte breve pero verificable:

1. Rama actual y commit si aplicaste commit.
2. Lista de archivos modificados.
3. Resumen de cambios por fase.
4. Comandos ejecutados y resultado.
5. Capturas generadas con rutas.
6. Riesgos o pendientes reales.
7. Que parte exacta del MVP quedo lista.
8. Que queda fuera del MVP y por que.

No uses lenguaje ambiguo como "deberia funcionar". Si no lo probaste, dilo. Si lo probaste, indica como.

## 13. Prioridad absoluta

Si el tiempo es limitado, este es el orden:

1. Reescribir layout del gameplay para que deje de parecer dashboard.
2. Hacer que el canvas sea protagonista.
3. Integrar avatar modular en Phaser.
4. Pulir una escena inicial 2.5D falsa con proporciones creibles.
5. Asegurar interaccion/decision/bitacora/salida segura.
6. Eliminar 404 y errores criticos.
7. Verificar con capturas desktop/mobile.

No disperses esfuerzo en 6 casos, Babylon, sistemas nuevos o refactors generales antes de cerrar esta vertical slice.

## 14. Frase guia

El MVP no es "tener muchos sistemas conectados". El MVP es que una persona pueda entrar, personalizar su avatar, jugar un primer caso psicosocial claro, tomar una decision, reflexionar y salir con feedback, viendo una interfaz que parezca un juego SIEP y no un panel administrativo roto.

