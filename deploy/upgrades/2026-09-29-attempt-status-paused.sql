-- Admite el estado PAUSED (pausa segura reanudable, ETH-02) en los intentos.
--
-- Solo hace falta en bases restauradas desde un deploy/db_seed.sql anterior a
-- este cambio: su CHECK rechaza PAUSED y pausar un intento responde 500.
-- Idempotente: se puede ejecutar más de una vez.
--
--   psql "$DATABASE_URL" -f deploy/upgrades/2026-09-29-attempt-status-paused.sql

BEGIN;

ALTER TABLE public.simulation_attempts_v2
    DROP CONSTRAINT IF EXISTS simulation_attempts_v2_status_check;

ALTER TABLE public.simulation_attempts_v2
    ADD CONSTRAINT simulation_attempts_v2_status_check
    CHECK (status IN ('IN_PROGRESS', 'PAUSED', 'SAFE_EXITED', 'COMPLETED'));

COMMIT;
