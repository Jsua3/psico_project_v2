-- Geometría de los NPCs ambientales del caso PDF (autoridad espacial, GAME-01).
--
-- record_npc_interaction exige ambient_json.ambientNpcs (clave, x, y, radio)
-- para acreditar una conversación. Las bases restauradas desde un
-- deploy/db_seed.sql anterior a este cambio no la tienen: hablar con la
-- enfermera, el médico o cualquier NPC ambiental responde 400 y el diálogo no
-- se abre. Los valores son los de seed_caso_pdf.MAPS (fuente de verdad) y
-- coinciden con los ScenarioConfig del frontend (assets/game/scenarios).
--
-- Se filtra por map_key a propósito: el frontend elige el ScenarioConfig (y por
-- tanto los NPCs que dibuja) por la clave del mapa, así que las versiones
-- clonadas del caso necesitan la misma geometría.
--
-- Una sola sentencia (atómica sin BEGIN/COMMIT) e idempotente: fusiona las
-- claves ambientNpcs/ambientNpcKeys y conserva music, mood y transitionText.
--
--   psql "$DATABASE_URL" -f deploy/upgrades/2026-10-01-ambient-npcs-caso-pdf.sql

UPDATE public.scene_maps AS sm
SET ambient_json = (sm.ambient_json::jsonb || v.npcs::jsonb)::text,
    updated_at = now()
FROM (VALUES
    ('hospital-urgencias',
     '{"ambientNpcs": [{"key": "enfermera-urgencias", "x": 560, "y": 330, "interactionRadius": 60}, {"key": "medico-guardia", "x": 640, "y": 290, "interactionRadius": 60}, {"key": "psicologa-orientadora", "x": 780, "y": 440, "interactionRadius": 60}], "ambientNpcKeys": ["enfermera-urgencias", "medico-guardia", "psicologa-orientadora"]}'),
    ('hospital-sala-escucha',
     '{"ambientNpcs": [{"key": "trabajadora-social", "x": 480, "y": 380, "interactionRadius": 60}], "ambientNpcKeys": ["trabajadora-social"]}'),
    ('hospital-sala-escucha-accion',
     '{"ambientNpcs": [{"key": "trabajadora-social", "x": 480, "y": 380, "interactionRadius": 60}], "ambientNpcKeys": ["trabajadora-social"]}'),
    ('hospital-sala-escucha-cierre',
     '{"ambientNpcs": [{"key": "trabajadora-social", "x": 480, "y": 380, "interactionRadius": 60}], "ambientNpcKeys": ["trabajadora-social"]}'),
    ('comisaria-recepcion',
     '{"ambientNpcs": [{"key": "orientadora-juridica", "x": 320, "y": 360, "interactionRadius": 60}, {"key": "sobreviviente-espera", "x": 180, "y": 380, "interactionRadius": 60}, {"key": "madre-acompanante", "x": 230, "y": 396, "interactionRadius": 60}], "ambientNpcKeys": ["orientadora-juridica", "sobreviviente-espera", "madre-acompanante"]}'),
    ('comisaria-consultorio',
     '{"ambientNpcs": [{"key": "apoyo-psicosocial", "x": 660, "y": 430, "interactionRadius": 60}], "ambientNpcKeys": ["apoyo-psicosocial"]}'),
    ('comisaria-consultorio-marco',
     '{"ambientNpcs": [{"key": "apoyo-psicosocial", "x": 660, "y": 430, "interactionRadius": 60}], "ambientNpcKeys": ["apoyo-psicosocial"]}'),
    ('comisaria-consultorio-cierre',
     '{"ambientNpcs": [{"key": "apoyo-psicosocial", "x": 660, "y": 430, "interactionRadius": 60}], "ambientNpcKeys": ["apoyo-psicosocial"]}')
) AS v(map_key, npcs)
WHERE sm.map_key = v.map_key;
