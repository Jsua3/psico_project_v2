import type { ActorRenderPlan } from './actor-render-plan.model';
import { buildRenderCore, deepFreeze } from './avatar-render-plan.util';
import type { CharacterManifestV1 } from './character-manifest.model';

export function resolveActorRenderPlan(
  manifest: CharacterManifestV1,
  actorId: string,
): ActorRenderPlan {
  const visualId = manifest.actorMappings[actorId];
  if (!visualId) {
    throw new Error(`actorMappings no contiene ${actorId}`);
  }

  const visual = manifest.actorVisuals.find(item => item.visualId === visualId);
  if (!visual) {
    throw new Error(`visualId desconocido: ${visualId}`);
  }

  return deepFreeze({
    ...buildRenderCore(
      manifest,
      `actor-${visualId}`,
      visual.displayName,
      visual.variant,
    ),
    actorId,
    visualId,
    selectable: false,
  });
}
