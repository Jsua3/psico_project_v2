# Biblioteca de escenarios

Aquí viven los **lugares** que el docente elige al empezar un caso: universidad, casa y
comisaría de familia (los tres completos, con arte provisional dibujado por código). Cada lugar trae sus salas, muebles, objetos, herramientas,
personajes y recorridos sugeridos. Elegir un lugar **copia** el escenario dentro del caso:
la biblioteca nunca se modifica desde un caso.

## Estructura

```
biblioteca/
  esquema/escenario.schema.json   forma del archivo (esquema 2; el 1 se acepta con aviso)
  scripts/geometria.mjs           zona caminable por encuadre y choques de cajas
  scripts/validar.mjs             validador (forma + integridad) y línea de comandos
  scripts/fixtures/minimo/        escenario mínimo que usan las pruebas
  escenarios/ESTILO.md            guía de arte y plantillas para generar imágenes
  escenarios/indice.json          lista de lugares (id, nombre, salas, completo, arteProvisional, temas, hitos)
  hoja-lugares.png                hoja general: la primera sala de cada lugar con sus cifras
  modelos/                        objetos y herramientas interactivos compartidos (desdeModelo)
  escenarios/<lugar>/
    escenario.json
    arte/salas/  arte/muebles/  arte/objetos/  arte/herramientas/
    fuentes/                      imágenes sin procesar (de referencia)
```

## Comandos

```bash
npm install
npm test                                   # pruebas del validador
npm run validar -- escenarios/universidad  # revisa un lugar
npm run modelos:aplicar -- escenarios/casa  # copia el arte de los modelos (desdeModelo) al lugar
npm run validar -- --todos                 # valida los lugares de escenarios/indice.json y el índice
python ../tools/escenarios/hoja_lugares.py  # hoja general (biblioteca/hoja-lugares.png)
```

`validar` sale con código 1 si hay errores y escribe cada hallazgo como
`ERROR <código> <dónde>: <mensaje>` (o `AVISO …`). Con `--kit <carpeta>` revisa las caras
de los personajes en otro kit; por defecto usa `../frontend/src/assets/characters/kit`.

## Qué revisa

| Código | Tipo | Qué significa |
|---|---|---|
| `esquema` | error | el archivo no tiene la forma del esquema (campo de más, valor no permitido…) |
| `id-repetido` | error | dos salas, muebles, hitos, puertas de una sala, etc. con el mismo nombre interno |
| `sala-inexistente` | error | una puerta o un recorrido apunta a una sala que no existe |
| `ref-inexistente` | error | una sala usa un mueble, objeto o personaje que no está en el lugar |
| `arte-faltante` | error | una imagen no está en disco |
| `arte-invalido` | error | una imagen no es PNG, o un fondo de sala no mide 960 × 528 |
| `faltan-expresiones` | error | al personaje le falta alguna de sus 6 caras (neutral, alegre, preocupada, triste, cautelosa, en-crisis) |
| `esquema-antiguo` | aviso | el archivo usa el esquema 1: le faltan `hitos`, `nivelRiesgoPorDefecto` y los modelos compartidos |
| `modelo-inexistente` | error | un objeto o herramienta con `desdeModelo` nombra un modelo que no está en `modelos/catalogo.json` |
| `desde-modelo-ambiguo` | error | un objeto o herramienta trae `desdeModelo` y, además, valores propios distintos de los del modelo (arte, animación, textos, efecto) |
| `indice-lugar-inexistente` | error | (`--todos`) el índice nombra un lugar sin `escenario.json` |
| `indice-no-coincide` | error | (`--todos`) una cifra o bandera del índice (`salas`, `hitos`, `completo`, `arteProvisional`, `nombre`) no coincide con el escenario |
| `indice-falta-lugar` | aviso | (`--todos`) hay un lugar en disco que el índice no nombra |
| `hito-inexistente` | error | un objeto o herramienta marca (`hitos`) un hito que el lugar no declara |
| `hito-sin-forma-de-cumplirse` | aviso | ningún objeto ni herramienta del lugar marca ese hito decisivo: lo cumple la autora con sus respuestas |
| `modelo-incompleto` | error | un objeto o herramienta viene de un modelo y tiene solo parte de los campos resueltos |
| `modelo-sin-aplicar` | aviso | un objeto o herramienta viene de un modelo y todavía no tiene su arte: falta `npm run modelos:aplicar -- <lugar>` |
| `entrada-bloqueada` | error | un mueble con choque tapa la entrada o una puerta (caja libre de 32×32) |
| `fuera-de-la-zona` | error | algo (mueble, objeto, personaje, entrada o puerta) queda fuera del suelo de la sala o contra una pared que el encuadre no tiene |
| `pocas-salas` | error (aviso si `completo` es `false`) | un lugar completo necesita al menos 8 salas |
| `encuadres-iguales` | aviso | todas las salas usan el mismo encuadre |
| `puerta-sin-vuelta` | aviso | se puede ir de A a B pero no volver |
| `puerta-a-si-misma` | error | una puerta lleva a la misma sala en la que está |
| `sala-inalcanzable` | aviso | desde la primera sala no se llega a esa sala por ninguna puerta |

Los recorridos sugeridos son la secuencia de escenas que se propone al docente, no un camino
físico: dos salas seguidas de un recorrido no necesitan una puerta entre ellas.

## Formato

El contrato exacto está en el plan P1
(`.superpowers/plans/2026-10-24-P1-formato-escenario-universidad.md`) y en el esquema.
Puntos clave:

- La sala mide 960 × 528 px, como en el juego.
- `x` e `y` de muebles, objetos y personajes son el **punto de apoyo en el suelo**
  (centro inferior). `ancho` y `alto` de un mueble son su caja de choque.
- El PNG de un mueble mide `ancho` de ancho pero suele ser **más alto que `alto`**: la caja
  es solo la huella en el piso. El PNG se dibuja con su **borde inferior** en el punto de apoyo
  (por ejemplo, el escritorio mide 122 × 58 y su caja 122 × 28). Lo que cuelga de la pared
  (tablero, cartelera) deja aire transparente abajo y va en `y = 236`, sin choque.
- Fondos de sala: PNG de 960 × 528. Objetos y herramientas: iconos de 32 × 32.
- Las puertas no tienen imagen propia: van pintadas en el fondo, en su posición.
- Zona caminable por encuadre: `tres-paredes` x 96–864, `dos-paredes-izquierda` x 96–936,
  `dos-paredes-derecha` x 24–864, `una-pared` x 24–936; siempre y 236–486.
- Un personaje toma sus caras de `frontend/src/assets/characters/kit/<recipeId>/portrait-<expresión>.png`.
  Son seis y siguen el modelo de métricas: vínculo retraída → `triste`, cautelosa → `cautelosa`,
  abierta → `alegre`; activación serena → `neutral`, tensa → `preocupada`, en crisis → `en-crisis`.
  Si vínculo y activación piden caras distintas manda la activación, salvo que sea serena.
- Esquema 2: el lugar declara `hitos` (`{key, label, description, decisive}`, lo que hace el
  psicólogo: «valorar el riesgo», «informar derechos»…) y `nivelRiesgoPorDefecto` (`VARIABLE`,
  `MODERATE`, `SEVERE`, `EXTREME`). Un objeto o herramienta puede venir de un modelo compartido
  (`desdeModelo: <id de modelos/catalogo.json>`): entonces no escribe `arte`, `animacionCerca`,
  `alRevisar`, `textoInteraccion` ni `efecto`; los rellena `npm run modelos:aplicar`.
- Cambiar el arte (por ejemplo, por fotos propias) solo reemplaza los PNG: el
  `escenario.json` no cambia.
