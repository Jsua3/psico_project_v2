import { TestBed } from '@angular/core/testing';

import { PlanoDelLugarComponent } from './plano-del-lugar.component';
import { normalizarLayout, textoDeLaSala } from './plano';
import { LAYOUT_HOSPITAL } from './plano-ejemplo.testing';

const PLANO = normalizarLayout(LAYOUT_HOSPITAL)!;

function montar(modo: 'mini' | 'completo', actual = 'pasillo', visitadas: ReadonlySet<string> = new Set()) {
  const fixture = TestBed.createComponent(PlanoDelLugarComponent);
  fixture.componentRef.setInput('plano', PLANO);
  fixture.componentRef.setInput('actual', actual);
  fixture.componentRef.setInput('visitadas', visitadas);
  fixture.componentRef.setInput('modo', modo);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PlanoDelLugarComponent', () => {
  it('un grupo por sala, con su estado como clase', () => {
    const el = montar('mini');
    expect(el.querySelectorAll('g.sala')).toHaveLength(8);
    expect(el.querySelectorAll('g.sala--actual')).toHaveLength(1);
    expect(el.querySelector('g.sala--actual')!.getAttribute('data-sala')).toBe('pasillo');
    expect(el.querySelector('g[data-sala="triaje"]')!.classList).toContain('sala--sin-visitar');
    expect(el.querySelector('g[data-sala="entrada-urgencias"]')!.classList).toContain('sala--visitada');
  });

  it('marca cada puerta y señala la sala actual con una forma, no solo con color', () => {
    const el = montar('mini');
    expect(el.querySelectorAll('g[data-sala="pasillo"] .puerta')).toHaveLength(8);
    expect(el.querySelectorAll('.aqui')).toHaveLength(1);
    expect(el.querySelector('g[data-sala="pasillo"] .aqui')).not.toBeNull();
  });

  it('el dibujo se escala solo: viewBox con la caja de todas las salas', () => {
    expect(montar('mini').querySelector('svg')!.getAttribute('viewBox')).toBe('-1416 -744 4752 2016');
  });

  it('el minimapa es una imagen con la alternativa en texto y sin nombres dibujados', () => {
    const el = montar('mini');
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(textoDeLaSala(PLANO, 'pasillo'));
    expect(el.querySelectorAll('svg text')).toHaveLength(0);
    expect(el.querySelector('ul')).toBeNull();
  });

  it('el plano completo nombra solo las salas visitadas y la actual', () => {
    const textos = Array.from(montar('completo').querySelectorAll('svg text')).map(t => t.textContent!.replace(/\s+/g, ' ').trim());
    expect(textos).toEqual(expect.arrayContaining(['Pasillo', 'Entrada de urgencias', 'Sala de espera']));
    expect(textos.join(' ')).not.toContain('Triaje');
  });

  it('el plano completo trae la lista para lector de pantalla, con la sala actual marcada', () => {
    const el = montar('completo', 'pasillo', new Set(['triaje']));
    const items = Array.from(el.querySelectorAll('ul.plano__lista li'));
    expect(items).toHaveLength(8);
    const actuales = items.filter(li => li.getAttribute('aria-current') === 'location');
    expect(actuales).toHaveLength(1);
    expect(actuales[0].textContent).toContain('Pasillo, estás aquí.');
    expect(items.map(li => li.textContent!.trim())).toContain('Triaje, visitada. Puertas: Pasillo.');
  });

  it('parte en dos líneas un nombre largo para que quepa en su sala', () => {
    const el = montar('completo', 'trabajo-social');
    const lineas = el.querySelectorAll('g[data-sala="trabajo-social"] text tspan');
    expect(lineas.length).toBeGreaterThan(1);
  });
});
