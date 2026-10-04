import { testKitBundle } from '../character/kit/testing/kit-testing';
import { resolvePortraitAsset } from './portrait-resolver.util';

const bundle = testKitBundle();
const png = (path: string) => `/assets/characters/kit/${path}.png`;

describe('resolvePortraitAsset (kit)', () => {
  it.each([
    ['hablante del seed', { speakerName: 'Abuela de la niña', emotion: 'neutral' }, png('abuela-familia/portrait-neutral')],
    ['la emoción vulnerable es preocupada', { speakerName: 'Sobreviviente (22 años)', emotion: 'vulnerable' }, png('sobreviviente/portrait-preocupada')],
    ['un portraitKey legado', { portraitKey: 'escucha-segura', emotion: 'danger' }, png('sobreviviente/portrait-triste')],
    ['una voz sin cuerpo no tiene retrato', { speakerName: 'Supervisión clínica', emotion: 'danger' }, null],
    ['un NPC de escenario que se llama como una voz', { recipeId: 'supervisor-clinico', speakerName: 'Supervisión clínica', emotion: 'positive' }, png('supervisor-clinico/portrait-alegre')],
    ['un hablante desconocido', { speakerName: 'Nadie' }, null],
  ])('%s', (_name, keys, expected) => {
    expect(resolvePortraitAsset(bundle, keys)).toBe(expected);
  });

  it('sin paquete del kit todavía, la silueta', () => {
    expect(resolvePortraitAsset(null, { speakerName: 'Abuela de la niña' })).toBeNull();
  });
});
