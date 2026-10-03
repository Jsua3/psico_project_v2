# Playtest 1 — Teclado, 1366x768 (tester1@psychosim.edu.co)

Jugadora de prueba: estudiante de psicología de séptimo semestre, primera vez, sin instrucciones. Razoné solo con lo que se ve y se lee en pantalla. Capturas en `(capturas no versionadas) shots/pt-keyboard/` (numeradas en orden de juego).

Entorno: Chromium con WebGL por software (swiftshader), 1366x768, solo teclado (más clics donde el teclado no era posible, y lo indico).

## 1. Hasta dónde llegué

Landing → login → dashboard → catálogo `/portal/simulador` → aviso de contenido → introducción → contexto inicial → Escena 1 (Hospital, Urgencias) → puerta → Sala de escucha familiar → pausa segura (Esc) → reanudar → recarga de página → reanudar intento → vuelta a Urgencias → lobby `/portal/jugar`.

NO llegué a H1 ni a la pantalla de resultados. Me detuve en la Escena 1 (bloque hospitalario) porque no logré encontrar a la Enfermera de urgencias (evidencia exigida para decidir H1) tras 5 posiciones y 10 pulsaciones de E (ver PLAY-KB-03). Gasté ~90 acciones de herramienta.

## 2. Bitácora por pantalla

| # | Pantalla | Qué veía | Qué esperaba | Qué hice | Resultado / ¿me perdí? |
|---|---|---|---|---|---|
| 1 | Landing (`01-landing.png`) | Hero claro, botón "Ingresar al sistema", maqueta con "Caso activo: Violencia intrafamiliar" y 3 botones de decisión deshabilitados | Entrar | Clic en Ingresar | OK. La maqueta de "decisiones disponibles" parece clicable pero está deshabilitada (fricción menor). Dice "intrafamiliar", el caso real es "Violencia Familiar y Tentativa de Feminicidio". |
| 2 | Dashboard (`03-portal.png`) | 4 caminos a "jugar": botón blanco "Continuar simulación" (lateral), "Simulador", "Ver casos y resultados", "Explorar simulaciones" | Que "Continuar simulación" me lleve al juego | Clic en "Continuar simulación" | Me llevó al catálogo (`04-after-continuar.png`), no al juego. Dice "Continuar" y no hay nada que continuar (0 en progreso). 1 acción perdida. |
| 3 | Catálogo (`04`) | Tarjeta del caso con "PUBLISHED" (inglés), "8 escenas", botón "Iniciar simulación" | Empezar | Clic | OK (aviso de contenido). |
| 4 | Aviso de contenido (`05-after-iniciar.png`) | Modal claro, salida segura (Esc) mencionada, "Volver al catálogo" / "Continuar" | Entender qué voy a jugar | Continuar | Bien resuelto. No dice cómo se juega, duración ni controles. |
| 5 | Introducción (`06-intro-video.png`) | Escena pixel-art con "HOSPITAL · URGENCIAS · NOCHE" y botón Continuar; HUD del juego visible y borroso detrás | Un video | Continuar | OK; no es video sino una escena animada. |
| 6 | Contexto inicial (`07-context.png`) | Texto largo con scroll interno, contenido muy duro (el hecho completo) | Leerlo | Continuar | OK. "Lee el contexto completo" pero Continuar ya está activo. |
| 7 | Mundo, t=0 y t=4 s (`08-world-t0.png`, `09-world-t4.png`) | Sala de urgencias con 5 personajes, 1 maletín, 2 puertas, tarjeta "OBJETIVO: Estabiliza emocionalmente a la familia…", barra inferior con 5 herramientas con candado, pista "WASD mover · E interactuar · J bitácora · Esc" | Saber a dónde ir y con qué interactuar | Caminé con A hacia el personaje más cercano | A los 10 s NO sabía qué objetos/personajes eran interactivos: nada tiene marca, nombre ni brillo claro (el maletín tiene un brillo muy leve). El objetivo no dice qué hacer, solo el fin. 3 acciones hasta descubrir que el maletín era interactivo. |
| 8 | Maletín Kit PAP (`11-near-medkit.png`, `12-after-E-medkit.png`) | Al acercarme (~50 px) aparece etiqueta "Kit PAP" y tarjeta "E Kit PAP" abajo a la derecha | — | E | El maletín desaparece SIN aviso; solo cambia la casilla 1 de la barra (de candado a icono). No hay mensaje "obtuviste el kit PAP". |
| 9 | Herramienta 1 (`13-press-1.png`, `14-click-tool1.png`, `15`) | Casilla "1" con número | Que la tecla 1 la abra | Pulsé 1 | Nada ocurre. Tuve que usar el ratón (clic) → aparece un cuadro de diálogo con solo "Contención y estabilización emocional en crisis." No explica cómo usarla. |
| 10 | Familia en crisis (`19-npc-familia-1.png`, `23-npc-familia-5.png`) | Panel lateral con retrato grande de la abuela, texto con máquina de escribir lenta, botones "Saltar ▶" / "Siguiente ▶" | Avanzar con E | Pulsé E | E NO avanza el diálogo (Enter sí). El pie dice "E interactuar" y nada dice "Enter para continuar". 1 intento fallido. |
| 11 | Final del diálogo (`23`) | Texto en paréntesis "(La familia necesita contención… La sala de escucha está al fondo a la derecha.)" atribuido a ABUELA DE LA NIÑA, y UNA sola opción: "1 Aplicar PAP a la familia en crisis" | Una decisión con varias opciones | Pulsé 1 | Funciona. Es la primera pista real de a dónde ir, pero llega al final de un diálogo y la dice "la abuela". Con una sola opción no es una decisión. |
| 12 | Feedback herramienta (`25-feedback-1.png`, `27-post-h1.png`) | "✓ HERRAMIENTA PERTINENTE… Estrés -5%". Después, el HUD sigue en Estrés 0%, Puntaje 0, Confianza/Bienestar 50%, "Paso 1 (1/6)" | Ver que algo cambió | Enter, Enter | No hay ningún cambio visible en el HUD. No sé si cuenta. El texto del feedback no lleva tildes ("intervencion profesional y etica"). |
| 13 | Buscar la salida (`28-walk-right.png`) | Al caminar a la derecha: "E Sala de escucha familiar →"; el jugador se superpone a "Psicóloga hospitalaria"; etiquetas encimadas | Que la puerta marque su nombre | Caminé 8 pulsaciones | La puerta es descubrible solo por proximidad. Etiqueta de la psicóloga solapada con la de la puerta (texto minúsculo ilegible). La psicóloga muestra nombre pero NO es interactiva (sin prompt). |
| 14 | Cruce de puerta (`33-door-t2.5.png`) | Sala de escucha: sofá, mesa, estantería, libro (Marco normativo), carpeta (EPICEE), cuaderno (Bitácora), NPC caminando y otra de pie; HUD sigue "Escenario 1 de 8 · Paso 1" y el MISMO objetivo | Que el objetivo cambiara a algo como "habla con la familia" | Exploré | Sin nuevo objetivo. Cambio de sala inmediato, sin fundido visible en mis capturas. La abuela ya aparece en la sala de escucha (buena continuidad). |
| 15 | Cuaderno y carpeta (`34`, `35`) | Se recogen con E, otra vez sin aviso; se desbloquean casillas 2 y 5 | — | E | Igual que el maletín: pickups silenciosos. |
| 16 | Libro "Marco normativo" (`38-lawbook-choices.png`) | Decisión con 3 opciones, todas con insignia "INFORMACIÓN INCOMPLETA"; zona de retrato vacía (icono de persona) | Elegir la opción que me parezca | Pulsé 2 | La opción 2 queda resaltada y bloqueada y NO PASA NADA: sin mensaje, sin error, sin petición de red (comprobado), el panel queda atrapado y el resto de opciones atenuadas (`40`, `46`). Con el ratón ídem. Esc cierra. 4 intentos (tecla 2, ratón, tecla 3, reabrir) → BLOQUEO. Consulté el e2e: esta decisión es H2 y exige haber hecho antes H1 (que a su vez exige hablar con la enfermera). |
| 17 | Bitácora J (`52-journal-J.png`) | Modal con 5 preguntas guía, caja de texto, "Guardar bitácora", "Trazabilidad: 1. Urgencias: cr…" truncado, "se cifran con AES-GCM" | — | J | Funciona y se entiende. Jerga técnica (AES-GCM). La lista de trazabilidad queda cortada. |
| 18 | Ajustes (`53-settings.png`) | Música, sonidos, movimiento reducido, "Bitácora J", "Catálogo" | Encontrar la ayuda / controles | Clic en la rueda | No hay "Cómo jugar" ni lista de controles. |
| 19 | Esc → pausa segura (`55-esc-pause.png`) | Pantalla completa de "PAUSA SEGURA ACTIVA" con PUNTAJE TOTAL, Decisiones clave Adecuadas/Riesgosas/Inadecuadas, Estrés final, Riesgo final, Desempeño, línea de tiempo con claves internas ("PAP sobre familia-crisis", "hospital-sala-escucha", "estres -5%") | Un cuadro tranquilo con "Reanudar" | Esc | Funciona y guarda, pero es un tablero de puntuación. El botón "Reanudar este intento" está en y=933 px (fuera de pantalla, hay que desplazar). |
| 20 | Reanudar y recarga (`56`, `57-reload-t4.png`, `59`) | Reanudar restaura mapa y posición exactos. Tras F5: "INTENTO EN PROGRESO: Continuar intento en progreso / Iniciar nuevo intento" | Volver donde estaba | Continuar | Funciona bien: vuelve a la misma sala y posición. No repite el aviso de contenido. "Puedes retomarlo desde Urgencias: crisis y contención" aunque yo estaba en la sala de escucha. "Iniciar nuevo intento" sin confirmación visible (inferencia: descarta el progreso). |
| 21 | Buscar enfermera (`60`, `61-no-prompt-enfermera.png`) | La mujer con bata verde junto al mostrador (pose de caminar, inmóvil) | Que fuera "la enfermera" | Me acerqué desde 5 posiciones y pulsé E 10 veces | Ni etiqueta, ni prompt, ni diálogo. BLOQUEO para seguir hacia H1. |
| 22 | Lobby `/portal/jugar` (`62-lobby-jugar.png`) | Pasillo pixel-art con una puerta "Violencia Familiar…" y "Entrar al caso (E)" | — | — | Funciona, pero ningún enlace visible del portal conduce a esta pantalla (inferencia: solo por URL directa). |

## 3. Momentos de confusión

| # | Momento | Acciones hasta resolver | Captura | Severidad percibida |
|---|---|---|---|---|
| C1 | "Continuar simulación" del dashboard lleva al catálogo y no al juego; hay 4 botones que dicen casi lo mismo | 2 | `04-after-continuar.png` | media |
| C2 | Primeros 10 s en Urgencias: ¿qué es interactivo? Ningún marcador, el objetivo no dice qué hacer | 3 | `08-world-t0.png` | alta |
| C3 | Recoger objetos sin ningún aviso (maletín, carpeta, cuaderno) | 1 cada uno | `12-after-E-medkit.png` | media |
| C4 | Tecla "1" no abre la herramienta aunque la casilla muestra el 1 | 2 | `13-press-1.png` | media |
| C5 | E no avanza el diálogo (Enter sí); nadie lo dice | 1 | `19-npc-familia-1.png` | media |
| C6 | Texto de narrador mostrado como habla de la abuela, y es la única pista de "a dónde ir" | 1 | `23-npc-familia-5.png` | media |
| C7 | La decisión de una sola opción no parece decisión; tras ella el HUD no cambia | 1 | `27-post-h1.png` | media |
| C8 | El objetivo ("Estabiliza emocionalmente…") no cambia nunca; HUD siempre "Escenario 1 de 8 · Paso 1 (1/6)" | — | `33-door-t2.5.png` | alta |
| C9 | Decisión H2 elegible pero muerta (insignia "INFORMACIÓN INCOMPLETA" sin decir qué falta) | 4 | `40-lawbook-after.png`, `46-lawbook-wait7.png` | blocker |
| C10 | No hay forma visible de encontrar a la enfermera exigida | 5 posiciones, 10 E | `61-no-prompt-enfermera.png` | blocker |
| C11 | Pausa segura = tablero de puntaje; "Reanudar" fuera de pantalla | 1 | `55-esc-pause.png` | alta |

## 4. Hallazgos

Ver el resultado estructurado (mismos ids). Resumen: 2 blockers (decisión muerta sin mensaje; enfermera no encontrable), 5 high, varios medium/low.

## 5. Lo que funciona bien

- Aviso de contenido previo a todo contenido sensible, con salida segura mencionada (`05-after-iniciar.png`).
- Esc con diálogo abierto cierra el diálogo; Esc sin diálogo abre la pausa guardada; reanudar y F5 restauran mapa y posición exactos (`56`, `59`).
- Al acercarse a un objeto aparecen etiqueta y tarjeta con la tecla E y su descripción (`11-near-medkit.png`).
- Diálogo con retrato grande y texto progresivo con "Saltar", legible y con buen contraste.
- Bitácora (J) y ajustes funcionan y se leen bien (`52`, `53`).
- La abuela "viaja" con el jugador entre salas: buena continuidad narrativa.

## 6. Notas de método y límites

- Rendimiento: se midió 22,5 FPS en el mundo, pero es WebGL por software (swiftshader) sin GPU, así que NO sirve para juzgar el presupuesto de 59 FPS (inferencia: no representativo).
- Código leído solo para desatascarme, tras 3+ intentos fallidos: `frontend/e2e/full-case.e2e.ts:48-111` (orden: Kit PAP → Familia → enfermera → sala de escucha → H1 hablando con la familia en la sala → H2 libro), `frontend/src/app/features/simulator/simulation-play.component.ts:1427-1436` (decisión de otra etapa → `showActionError`, que no vi en pantalla), `frontend/src/app/features/simulator/dialogue-panel.component.ts:529-545` (`handleChoice` bloquea la opción y no la libera), `backend_django/apps/simulation/management/commands/seed_caso_pdf.py:597` (enfermera ambiental en 560,330).
- No pude confirmar con certeza por qué E no abrió a la enfermera (inferencia: NPC ambiental sin prompt contextual, posición o radio distintos al render).
