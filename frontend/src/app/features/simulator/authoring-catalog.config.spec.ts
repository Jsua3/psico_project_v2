import { testKitBundle } from '../character/kit/testing/kit-testing';
import { AUTHORING_OBJECT_TEMPLATES, buildObjectFromTemplate } from './authoring-catalog.config';

describe('plantillas de objetos del editor de mundo', () => {
  it('el NPC nuevo nace con una receta del kit que existe y no es un jugable (spec §9.2)', () => {
    const npc = AUTHORING_OBJECT_TEMPLATES.find(template => template.id === 'npc')!;
    expect(npc.metadata).toEqual({ recipeId: 'madre-acompanante' });
    expect(testKitBundle().recipes['madre-acompanante']?.kind).toBe('npc');
    expect(buildObjectFromTemplate(npc, 'npc-1', 0, 0, 1).metadata).toEqual({ recipeId: 'madre-acompanante' });
  });
});
