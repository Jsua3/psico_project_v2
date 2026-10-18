# Copia del taller de DSL para las pruebas (E4-0, R4)

Estos archivos son una **copia literal** de lo que entregó el taller de Ingeniería de Software II
(fases 1, 3 y 4; autores Juan José Sua Gómez y Emerson Ángel Gómez; la Fase 2, las reglas OCL, la
entregan otros integrantes). El original está en `docs/diseno/dsl/` y es evidencia del equipo: **no
se edita**. Se copia aquí porque la consolidación de `docs/` retira esa carpeta y las pruebas del
validador no pueden depender de una ruta que desaparece.

Origen: commit `dc8e537` (`git show dc8e537:docs/diseno/dsl/<archivo>`), copiado el 2026-10-16.

| Archivo | Origen | SHA-256 |
|---|---|---|
| `validar_dsl.py` | `docs/diseno/dsl/validador/validar_dsl.py` | `6a59f535c75ff7e1974afe1300d68d6f83c2158e48ed9b6b5661d8b74e873c8e` |
| `dsl-casos.schema.json` | `docs/diseno/dsl/dsl-casos.schema.json` | `9e272e72df721098fa7366cc16866ce5e5691cd1fd38fd0273dbc6de8e671d7d` |
| `simulador_psicologia_social.json` | `docs/diseno/dsl/simulador_psicologia_social.json` | `4fa1a1cc6c3db10b1d21c613ac7ac7424bdb4705134e0a5c4406789862cb370d` |
| `ejemplo-minimo.json` | `docs/diseno/dsl/ejemplo-minimo.json` | `20b5923941b9609f8210160e3da7ae5542ddd0bd53d58186b20a07d8420f536e` |

`apps/simulation/casedef/schema/dsl-casos.schema.json` es una segunda copia **idéntica** del esquema
(el paquete `casedef` no puede leer de `tests/`); una prueba exige que sean iguales byte a byte.

## Para qué sirven

- `test_dsl_differential.py` invoca `validar_dsl.py` por subproceso y compara su veredicto con el del
  validador del producto en los dos escenarios del taller y en 200 mutaciones.
- `test_definition_export.py` exige que el documento exportado, **sin** `x-siep`, lo valide
  `validar_dsl.py` tal cual.
- `test_casedef_form.py` usa el esquema y los escenarios para la comprobación cruzada de la forma.

## Cuando el taller cambie

Si el equipo actualiza el taller (por ejemplo, cuando entreguen la Fase 2 de reglas OCL): copiar
los archivos de nuevo con `git show <commit>:docs/diseno/dsl/<archivo>`, actualizar la tabla de
arriba y las constantes de `test_casedef_package.py` y volver a correr la prueba diferencial. Si el
validador del producto difiere, el defecto es del port, no de la prueba.
