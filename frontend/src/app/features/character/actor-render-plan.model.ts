import type { AvatarRenderPlan } from './avatar-render-plan.model';

export interface ActorRenderPlan extends Omit<
  AvatarRenderPlan,
  'characterId' | 'variantId'
> {
  readonly actorId: string;
  readonly visualId: string;
  readonly selectable: false;
}
