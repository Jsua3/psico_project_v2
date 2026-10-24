# Biblioteca de escenarios

Aquí viven los **lugares** que el docente elige al empezar un caso: universidad, casa,
comisaría de familia… Cada lugar trae sus salas, muebles, objetos, herramientas,
personajes y recorridos sugeridos. Elegir un lugar **copia** el escenario dentro del caso:
la biblioteca nunca se modifica desde un caso.

## Estructura

```
biblioteca/
  esquema/escenario.schema.json   forma del archivo (esquema 1)
  scripts/geometria.mjs           zona caminable por encuadre y choques de cajas
  scripts/validar.mjs             validador (forma + integridad) y línea de comandos
  scripts/fixtures/minimo/        escenario mínimo que usan las pruebas
  escenarios/ESTILO.md            guía de arte y plantillas para generar imágenes
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
```

`validar` sale con código 1 si hay errores y escribe cada hallazgo como
`ERROR <código> <dónde>: <mensaje>` (o `AVISO …`). Con `--kit <carpeta>` revisa las caras
de los personajes en otro kit; por defecto usa `../frontend/src/assets/characters/kit`.

## Qué revisa

| Código | Tipo | Qué significa |
|---|---|---|
| `esquema` | error | el archivo no tiene la forma del esquema (campo de más, valor no permitido…) |
| `id-repetido` | error | dos salas, muebles, puertas de una sala, etc. con el mismo nombre interno |
| `sala-inexistente` | error | una puerta o un recorrido apunta a una sala que no existe |
| `ref-inexistente` | error | una sala usa un mueble, objeto o personaje que no está en el lugar |
| `arte-faltante` | error | una imagen no está en disco |
| `faltan-expresiones` | error | al personaje le falta alguna de sus 4 caras (neutral, alegre, preocupada, triste) |
| `entrada-bloqueada` | error | un mueble con choque tapa la entrada o una puerta (caja libre de 32×32) |
| `fuera-de-la-zona` | error | algo queda fuera del suelo de la sala o contra una pared que el encuadre no tiene |
| `pocas-salas` | error (aviso si `completo` es `false`) | un lugar completo necesita al menos 8 salas |
| `encuadres-iguales` | aviso | todas las salas usan el mismo encuadre |
| `puerta-sin-vuelta` | aviso | se puede ir de A a B pero no volver |

## Formato

El contrato exacto está en el plan P1
(`.superpowers/plans/2026-10-24-P1-formato-escenario-universidad.md`) y en el esquema.
Puntos clave:

- La sala mide 960 × 528 px, como en el juego.
- `x` e `y` de muebles, objetos y personajes son el **punto de apoyo en el suelo**
  (centro inferior). `ancho` y `alto` de un mueble son su caja de choque.
- Zona caminable por encuadre: `tres-paredes` x 96–864, `dos-paredes-izquierda` x 96–936,
  `dos-paredes-derecha` x 24–864, `una-pared` x 24–936; siempre y 236–486.
- Un personaje toma sus caras de `frontend/src/assets/characters/kit/<recipeId>/portrait-<expresión>.png`.
- Cambiar el arte (por ejemplo, por fotos propias) solo reemplaza los PNG: el
  `escenario.json` no cambia.
