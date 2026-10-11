# Decisiones tomadas por defecto durante el contraste

> Registro para que el usuario las revise. Ninguna es una decisión de producto del equipo: son supuestos de trabajo que permitieron avanzar sin esperar respuesta. Cada una indica cómo deshacerla.

| # | Decisión | Por qué | Cómo se revierte |
|---|---|---|---|
| 1 | Los requisitos propios de SIEP llevan IDs `SIEP-RF-nn`, `SIEP-RNF-nn`, `SIEP-RN-nn`, `SIEP-CU-nn`, con bloques reservados `SIEP-RF-C-nn` … `SIEP-RF-J-nn` para las propuestas; la línea base queda intacta (decisión #1 de §8 del prompt) | El prefijo elimina las colisiones `RNF-02`/`RNF-002`, `RNF-07`/`RNF-007`, `RNF-08`/`RNF-008` y `RNF-010` | Renombrar en `extensiones-siep.md`; es un cambio mecánico porque nada más lo cita todavía |
| 2 | El subproyecto 1 se hizo con **contraste selectivo**: se recuperaron 50 veredictos de la corrida abortada, se evaluó solo autoría y se sometieron a dos lentes únicamente los «cumple» y «conflicto» (opción aprobada por el usuario en el chat) | Ahorra ≈ 2,8 M tokens de agentes ya pagados y cumple el §6.4 del prompt | Relanzar el contraste de los «parcial» con un workflow aparte |
| 3 | No se editó `docs/diseno/dsl/**` ni se regeneró el taller de DSL | Reparto con la otra sesión, que cierra la fase 4 y su PR | — |
| 4 | Tres desacuerdos entre lentes se resolvieron así: **RNF-01 → parcial**, **RN-08 → conflicto**, **RN-09 → conflicto (de interpretación)** | Verificado leyendo `login-role.config.ts:32,47,62`, `settings/base.py:122-123`, `decision_effects.py:72-80` y `rubric_service.py:418-429` | Editar `datos/resoluciones.json` y regenerar |
| 5 | Los veredictos «parcial», «no cumple» y «no verificable» no pasaron por contraste adversarial | El método solo lo exige para «cumple» y «conflicto» | Ver 2 |
| 6 | No se modificó código. Los defectos D-1 a D-5 (alcance por docente, guardado de nodo y credenciales en claro) están verificados pero **sin corregir** | El Frente 3 exige decisiones aprobadas y el usuario no las ha dado | Pedir el PR de la ola 0 de `conflictos-y-decisiones.md` §2 |
| 7 | Los valores por defecto de las 21 decisiones de `conflictos-y-decisiones.md` §4 son recomendaciones, no decisiones | El prompt pide un valor por defecto recomendado para cada una | — |
| 8 | Se corrigieron a mano dos rutas de evidencia en `datos/evaluadores/g10-rnf-b.json` | Una apuntaba al volcado temporal del Excel y la otra tenía un límite de línea desfasado en una unidad | Restaurar el JSON desde la corrida original (`wf_cce42727-3e5`) |

## Observaciones que no se tocaron

- La carpeta `docs/diseñosistemas_docs/` (informes y evidencia de la serie ADSI) tiene un nombre accidental («diseño» + «sistemas_docs»). Renombrarla afecta enlaces y la etiqueta `pre-limpieza-2026-10`; se deja para quien la mantenga.
- `docs/informes/2026-10-10-mapa-del-sistema/secciones/` sigue en borrador sin verificación adversarial; el contraste **no** se apoyó en ese mapa (los evaluadores leyeron el código), salvo la sección de extensiones, que marca con `[m]` lo tomado de él.
