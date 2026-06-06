import { isGameRoute } from './game-route.util';

describe('isGameRoute', () => {
  it('matches a specific simulador play route', () => {
    expect(isGameRoute('/portal/simulador/42')).toBe(true);
  });

  it('matches the jugar menu world', () => {
    expect(isGameRoute('/portal/jugar')).toBe(true);
  });

  it('does not match the simulador list', () => {
    expect(isGameRoute('/portal/simulador')).toBe(false);
  });

  it('does not match other portal routes', () => {
    expect(isGameRoute('/portal/dashboard')).toBe(false);
  });
});
