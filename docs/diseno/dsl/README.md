# Taller de DSL para el simulador de casos situacionales de psicología social

Entrega de Ingeniería de Software II, fases 1, 3 y 4. Autores: Juan José Sua Gómez y Emerson Ángel Gómez. La Fase 2 (reglas OCL) la entregan otros integrantes del grupo.

## Dónde está cada entregable

| Entregable del enunciado | Archivos | Qué es |
|---|---|---|
| **1. Modelo UML** (Fase 1) | `modelo-dominio.png` | Diagrama de clases, en imagen |
| | `modelo-dominio.mmd` | El mismo diagrama, editable (Mermaid) |
| | `fase-1-modelo-dominio.md` | Clases, atributos, relaciones, cardinalidades, responsabilidades e invariantes |
| **2. Reglas OCL** (Fase 2) | A cargo de otros integrantes | Numeración acordada: `OCL-01` a `OCL-08`, en el orden en que el enunciado las lista en la Fase 2. Expresiones de apoyo: `fase-1-modelo-dominio.md` §6.2 y `fase-4-validacion.md` §1.5 |
| **3. DSL** (Fases 3 y 4) | `simulador_psicologia_social.json` | El archivo que pide el enunciado: escenario válido y escenario con errores |
| | `dsl-casos.schema.json` | Sintaxis concreta: JSON Schema del lenguaje |
| | `fase-3-sintaxis-concreta.md` | Diseño de la sintaxis en JSON y correspondencia con SIEP |
| | `fase-4-validacion.md` | Los dos escenarios, la tabla de análisis de errores y los resultados de la ejecución |

## Material de apoyo

| Archivo | Para qué sirve |
|---|---|
| `ejemplo-minimo.json` | Un documento DSL válido y pequeño, para entender la estructura |
| `verificar-fase-3.py` | Comprueba el esquema y reparte las reglas entre las dos capas con 32 alteraciones del ejemplo |
| `validador/validar_dsl.py` | Validador: forma (esquema) más las reglas `OCL-01` a `OCL-08` y `PROP-01` a `PROP-08` |
| `validador/test_validar_dsl.py` | Pruebas del validador |
| `validador/probar_las_pruebas.py`, `validador/estres_aleatorio.py` | Comprueban que las pruebas detectan una regla rota y prueban 4000 documentos alterados |
| `validador/salida-*.txt`, `validador/salida-validador.json` | Resultado real de cada ejecución |

## Cómo comprobarlo

Desde la carpeta `validador/` (solo hace falta Python 3; `jsonschema` es opcional). `C:/Python313/python.exe` es la instalación del equipo donde se ejecutó: en otro equipo se usa `python` o `python3`.

```
C:/Python313/python.exe -I -B validar_dsl.py ..\simulador_psicologia_social.json
C:/Python313/python.exe -I -B test_validar_dsl.py -v
```

El primer comando debe terminar con el código de salida 0: el escenario 1 no incumple ninguna regla y el escenario 2 incumple las cinco previstas (`OCL-02`, `OCL-03`, `OCL-05`, `OCL-06` y `OCL-07`).
