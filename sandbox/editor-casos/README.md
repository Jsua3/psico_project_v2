# Sandbox del editor de casos (P3)

Versión de prueba, simplificada, de cada momento que vive el docente al crear un caso: elegir un
lugar y sus salas, acomodar cada sala, escribir el guion de cada escena, conectar los caminos,
definir los finales, pedirle ayuda a la IA, probar el caso como estudiante y dejarlo listo para
revisión.

Corre en tu máquina. No tiene cuentas ni guardado en servidor: el caso se guarda en el navegador
(un solo caso a la vez). No toca el juego ni la base de datos del proyecto.

## Cómo arrancarlo

Necesitas Node 24.15 o más nuevo.

```bash
cd sandbox/editor-casos
npm install
```

**La IA es opcional.** Sin key, el asistente responde con ejemplos fijos y lo dice en pantalla
(«Modo sin conexión»). Para usar la IA de verdad:

1. Copia `.env.example` a `.env` (en esta misma carpeta).
2. Pon tu key de Claude en `ANTHROPIC_API_KEY=`. El archivo `.env` nunca se sube al repositorio.
3. Si quieres, cambia `IA_TOPE_PETICIONES_DIA` (200 por defecto): cuántas veces al día se puede
   pedir ayuda antes de que el asistente diga que llegó al límite.

Luego, en **dos terminales**:

```bash
npm run ia      # el servidor de la IA, en http://localhost:4311
```

```bash
npm start       # el editor, en http://localhost:4310
```

En la terminal de `npm run ia` debe decir «con la key de .env» (si dice «sin key», el archivo
`.env` no se leyó: revisa que esté en esta carpeta y que la línea sea `ANTHROPIC_API_KEY=tu-key`,
sin comillas ni espacios).

Abre http://localhost:4310 en el navegador.

**Para probar la IA con tu key:** crea un caso (Mis casos → Crear un caso nuevo → universidad →
«Atención en Bienestar»), pulsa «Asistente de IA» y pídele, por ejemplo, «Agrega una respuesta
con riesgo a la primera escena». Debe aparecer una propuesta por partes, con casillas, marcada
«Sugerido por la IA»; nada cambia hasta que pulses «Aplicar lo marcado», y «Deshacer lo aplicado»
lo revierte. Si el asistente dice «Modo sin conexión», el servidor no está corriendo o no tiene
la key. El editor le pasa al servidor de la IA todo lo que
empieza por `/api`. Si `npm run ia` no está corriendo, el asistente se pone en modo sin conexión
y todo lo demás funciona igual.

Cada petición a la IA queda anotada en `servidor/registro.jsonl` (fecha, pantalla, cuántos
cambios propuso y si salió bien). Ahí no queda ni la key ni el contenido del caso.

## Cómo empezar de cero

En la cabecera, **«Reiniciar el sandbox»** → **«Sí, borrar todo»**. Borra el caso guardado en
el navegador y vuelve a «Mis casos». Úsalo entre una persona y otra en las pruebas con docentes.

Si algo se ve raro después de actualizar el código, recarga la página con <kbd>Ctrl</kbd> +
<kbd>F5</kbd>.

## Pruebas automáticas

```bash
npm test          # pruebas de pantallas y lógica (Vitest)
npm run test:ia   # pruebas del servidor de la IA, con la API simulada
npm run e2e       # de punta a punta en Chromium: camino feliz, accesibilidad, ancho y recarga
```

`npm run e2e` arranca solo el editor y el servidor de la IA (sin key). Usa el Chromium que
Playwright tenga en caché; si no lo encuentra, indica uno con la variable `E2E_CHROMIUM_PATH`.

## Guion de prueba con un docente

Al estilo de Steve Krug: una persona a la vez, unos 20 minutos, tú observas y no ayudas. Lo que
buscamos no es si la persona «lo hace bien», sino dónde el editor la hace dudar.

### Antes de empezar

- Reinicia el sandbox para que la persona vea «Mis casos» vacío.
- Ten el editor abierto en una pantalla de 1366×768 o más grande.
- Lee en voz alta, tal cual:

> «Gracias por ayudarnos. Vamos a probar un editor para crear casos del juego, no te vamos a
> probar a ti: no hay respuestas malas. Si algo te confunde, es un problema del editor y es
> justo lo que queremos encontrar. Te pido que pienses en voz alta: di qué buscas, qué esperas
> que pase y qué te sorprende. Yo no te voy a ayudar mientras haces las tareas; al final
> conversamos. Puedes parar cuando quieras.»

### Las cuatro tareas

Léelas una por una. No digas los nombres de los botones.

1. **Crea un caso nuevo que pase en la universidad.** Usa la idea que te parezca.
2. **En una de las salas, cambia la cara de un personaje** para que se vea preocupado.
3. **Haz que una de las respuestas del estudiante lleve a una escena que todavía no existe.**
4. **Prueba el caso como si fueras estudiante** hasta llegar a un final.

Si la persona se queda trabada más de 3 minutos en una tarea, anótalo y pasa a la siguiente.

### Qué observar

- **Dónde duda:** se detiene, mueve el cursor sin hacer clic, vuelve atrás.
- **Qué busca:** palabras que dice («¿dónde está…?»), menús que abre, si usa el buscador
  (<kbd>Ctrl</kbd> + <kbd>K</kbd>) o la guía.
- **Qué dice en voz alta:** cópialo tal cual, sobre todo las sorpresas («ah, no sabía que…»).
- Si usa el asistente de IA: qué le pide y si revisa lo que propone antes de aplicarlo.
- Palabras que no entiende o que interpreta distinto a como las pensamos.

### Al final

Pregunta, sin defender el editor:

- «¿Qué fue lo más confuso?»
- «¿Qué esperabas que hiciera y no hizo?»
- «Si mañana tuvieras que crear un caso real, ¿lo harías con esto? ¿Qué te falta?»

### Hoja para anotar

Copia esta tabla una vez por persona.

| | |
|---|---|
| Persona (sin nombre: rol y años de docencia) | |
| Fecha | |
| ¿Había usado el juego antes? | |

| Tarea | ¿La terminó? (sí / con dudas / no) | Tiempo | Dónde dudó | Qué dijo en voz alta |
|---|---|---|---|---|
| 1. Crear un caso en la universidad | | | | |
| 2. Cambiar la cara de un personaje | | | | |
| 3. Una respuesta que abre un camino nuevo | | | | |
| 4. Probarlo como estudiante | | | | |

| Al final | |
|---|---|
| Lo más confuso | |
| Lo que esperaba y no pasó | |
| ¿Lo usaría para un caso real? ¿Qué le falta? | |
| Palabras que no entendió | |
