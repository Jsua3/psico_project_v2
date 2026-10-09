import { readFileSync } from 'fs';
import { join } from 'path';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationCatalogComponent } from './simulation-catalog.component';

const source = readFileSync(join(__dirname, 'simulation-catalog.component.ts'), 'utf-8');

function createCatalog(): SimulationCatalogComponent {
  TestBed.configureTestingModule({
    providers: [
      { provide: SimulationService, useValue: {} },
      { provide: Router, useValue: {} },
      { provide: AuthService, useValue: { hasRole: () => false } },
    ],
  });
  return TestBed.runInInjectionContext(() => new SimulationCatalogComponent());
}

describe('catálogo de simulaciones: textos en español (T15.4)', () => {
  it('rotula el estado de la versión del caso en español, no el valor interno', () => {
    const catalog = createCatalog();

    expect(catalog.statusLabel('PUBLISHED')).toBe('Publicado');
    expect(catalog.statusLabel('DRAFT')).toBe('Borrador');
    expect(catalog.statusLabel('IN_REVIEW')).toBe('En revisión');
    expect(catalog.statusLabel('ARCHIVED')).toBe('Archivado');
  });

  it('conserva las etiquetas de los estados de intento', () => {
    const catalog = createCatalog();

    expect(catalog.statusLabel('COMPLETED')).toBe('Finalizado');
    expect(catalog.statusLabel('PAUSED')).toBe('En pausa (reanudable)');
    expect(catalog.statusLabel('IN_PROGRESS')).toBe('En curso');
    expect(catalog.statusLabel('')).toBe('Sin estado');
  });

  it('la tarjeta del caso pasa el estado por statusLabel (nunca imprime PUBLISHED)', () => {
    expect(source).toContain('{{ statusLabel(item.status) }}');
    expect(source).not.toContain('{{ item.status }}');
  });

  it('el texto visible lleva tildes', () => {
    for (const mal of ['aparecera', 'aqui.', 'simulacion,', 'alertas eticas', 'Estres final', 'criticas<', 'revision docente', 'diagnostico automatico', 'retroalimentacion docente']) {
      expect(source).not.toContain(mal);
    }
    expect(source).toContain('alertas éticas');
    expect(source).toContain('Estrés final');
  });

  it('conserva los nombres de botón que usan los e2e', () => {
    expect(source).toContain('Iniciar simulación');
  });
});
