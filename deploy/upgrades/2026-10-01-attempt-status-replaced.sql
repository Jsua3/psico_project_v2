-- Separa el reemplazo de un intento (forceNew) de la salida segura.
--
-- Hasta este cambio, empezar un intento nuevo con forceNew cerraba el anterior
-- como SAFE_EXITED con un evento SAFE_EXIT_REQUESTED, y los reportes lo
-- contaban (y lo promediaban) como salida segura. Ahora el reemplazo tiene su
-- estado (REPLACED) y su evento (ATTEMPT_REPLACED).
--
-- 1. El CHECK de simulation_attempts_v2.status admite REPLACED. Sin esto,
--    forceNew responde 500: aplica el script ANTES de desplegar el código.
-- 2. Reclasifica los reemplazos ya guardados. Lo único que los distinguía de
--    una salida segura real es el detalle fijo del evento, «Reemplazado por
--    nuevo intento». Las salidas seguras reales llevan otro detalle (el motivo
--    del estudiante o «Salida segura solicitada») y no se tocan.
--
-- Idempotente: se puede ejecutar más de una vez.
--
--   psql "$DATABASE_URL" -f deploy/upgrades/2026-10-01-attempt-status-replaced.sql

BEGIN;

ALTER TABLE public.simulation_attempts_v2
    DROP CONSTRAINT IF EXISTS simulation_attempts_v2_status_check;

ALTER TABLE public.simulation_attempts_v2
    ADD CONSTRAINT simulation_attempts_v2_status_check
    CHECK (status IN ('IN_PROGRESS', 'PAUSED', 'SAFE_EXITED', 'COMPLETED', 'REPLACED'));

UPDATE public.simulation_attempts_v2 AS a
SET status = 'REPLACED'
WHERE a.status = 'SAFE_EXITED'
  AND EXISTS (
      SELECT 1
      FROM public.attempt_events AS e
      WHERE e.attempt_id = a.id
        AND e.event_type = 'SAFE_EXIT_REQUESTED'
        AND e.detail = 'Reemplazado por nuevo intento'
  );

UPDATE public.attempt_events
SET event_type = 'ATTEMPT_REPLACED'
WHERE event_type = 'SAFE_EXIT_REQUESTED'
  AND detail = 'Reemplazado por nuevo intento';

COMMIT;
