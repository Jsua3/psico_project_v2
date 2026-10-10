# Análisis y diseño de sistemas — material de la aplicación de patrones en SIEP

Carpeta única del trabajo de la materia (CUE, 4.º semestre, docente Diana María Valencia).
Equipo: Juan José Sua, Emerson Ángel Gómez, Santiago Leyton, Esteban Bonilla.

| Archivo | Para qué sirve |
|---|---|
| `CAMBIOS_ADSI.md` | **Registro vivo**: cada patrón o antipatrón aplicado, con problema, solución, riesgo, commit, pruebas y capturas |
| `FASE0_EVALUACION.md` | Evaluación contra el código real, catálogo v2 de patrones, estado y qué sigue (§8–§9: actualización del 9 oct) |
| `PLAN_APLICACION_PATRONES_SIEP.md` | Plan v1 (parcialmente superado por `FASE0_EVALUACION.md`) |
| `PROMPT_MAESTRO_ADSI_SIEP.md` | Contexto completo para abrir una sesión nueva de trabajo con Claude (anterior a la pila de ramas: su §8 describe el flujo de entonces) |
| `INFORME_ANTIPATRONES_Y_SOLID.md` | **Para el informe:** antipatrones encontrados y qué se hizo con cada uno, mapa SOLID, lo que no se arregló |
| `PATRONES_EXISTENTES_Y_DESCARTADOS.md` | **Para el informe:** patrones que SIEP ya tenía (Unidad 5), patrones aplicados por unidad y los evaluados y descartados, con su razón |
| `EVIDENCIA_GIT.md` | Ramas, pull requests e historial de la serie (generado: no se edita a mano) |
| `DECISIONES_SESION_NOCTURNA_2026-10-10.md` | Qué decidió Claude sin supervisión la noche del 9 al 10 de octubre, con sus dudas, lo que no hizo y cómo descartarlo (no es un entregable: se puede borrar) |
| `P-NN/`, `A-NN/`, `L-NN/` | Evidencia de cada cambio (`P-` patrones, `A-` antipatrones y limpieza, `L-` contrato de Liskov): `antes_*.png`, `despues_*.png`, `uml_antes.*`, `uml_despues.*` (`.mmd` = fuente Mermaid) |
| `tools/codeshot.py` | Genera la captura PNG de un fragmento con sus números de línea reales |
| `tools/git_evidence.py` | Genera `EVIDENCIA_GIT.md` desde `git` y `gh pr list` |

## Convenciones

- **«Antes»** = tag `adsi-baseline-2` (`dd4eb89`); `adsi-baseline` (`f39ab96`) es el original.
- **Una rama por cambio** (`adsi/pNN-nombre`) desde `adsi/integracion`, con PR hacia `adsi/integracion`. `master` no se toca hasta el final.
- **Antes de refactorizar**, pruebas de caracterización en verde; después, la prueba nueva debe fallar si se rompe el código a propósito.
- **Commits** en español, formato Conventional Commits.

## Cómo se generan las capturas y los diagramas

```bash
# Captura de código (necesita Pillow y Pygments)
python docs/diseñosistemas_docs/tools/codeshot.py RUTA DESDE HASTA SALIDA.png --title "ANTES  archivo (líneas a-b)" --hl 10-14
# El «antes» sale de la etiqueta:  git show adsi-baseline-2:RUTA > /tmp/antes.py

# Diagrama UML (Mermaid CLI)
mmdc -i P-01/uml_despues.mmd -o P-01/uml_despues.png -b white -s 2
```

**En Windows:** `codeshot.py` usa DejaVu Sans Mono si existe y, si no, Consolas. `mmdc` necesita un Chromium; si no
quieres descargar el de Puppeteer, instala el CLI con `PUPPETEER_SKIP_DOWNLOAD=1` y pásale uno ya instalado
(por ejemplo el de Playwright) con `-p puppeteer.json`, donde el archivo contiene
`{ "executablePath": "C:/Users/<usuario>/AppData/Local/ms-playwright/chromium-NNNN/chrome-win64/chrome.exe", "args": ["--no-sandbox"] }`.
