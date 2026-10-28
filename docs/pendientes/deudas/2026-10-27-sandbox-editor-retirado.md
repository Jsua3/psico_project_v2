# Sandbox del editor de casos: retirado (P6)

Al llevar el editor nuevo al programa (P6, Tarea 5), `sandbox/editor-casos/` salió del árbol. Lo que se recupera y de dónde:

- **El sandbox aprobado** (aplicación Angular propia, servidor Node de IA local, pruebas de extremo a extremo con Playwright, README): rama `claude/editor-casos-p3`, commit `b13222a5` (`git show b13222a5:sandbox/editor-casos/<ruta>`).
- **Lo que pasó al programa:** `src/app/{modelo,estado,ia,guia,pantallas}` y el marco → `frontend/src/app/features/autoria/`. `@dagrejs/dagre` entró en `frontend/package.json`. El servidor de IA local y su «modo sin conexión» no pasan: la IA del programa es la de `assistant/*` (P5).
- **Lo que se retiró sin reemplazo todavía:** las pruebas de extremo a extremo del sandbox (`e2e/`: accesibilidad con axe, ancho a 1366 y 1280, cabecera, camino feliz). Hay que reescribirlas contra el programa cuando el editor esté enganchado a las rutas (Tarea 5b/8). Su comprobación de «palabras prohibidas» pasó a una prueba de las plantillas (`features/autoria/textos-visibles.spec.ts`), que mira el texto fijo pero no el dibujado en el navegador.
- **El botón «Reiniciar el sandbox»** y su confirmación desaparecieron del marco; el almacén local del caso (`sandbox-editor-casos/v1`) sigue hasta que el store se respalde en la API (5b).
