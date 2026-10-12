import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EMPTY_STATE_COPY } from './state-copy';
import { UiEmptyKind, UiEmptyState } from './ui-empty-state';

/**
 * ui-empty-state (plan visual §2.5, F2-5; VD-8): tres clases de vacío con textos distintos —primer uso (invita con
 * una acción), sin resultados («Limpiar filtros») y sin permiso o sin asignar (explica quién lo habilita)—, con una
 * ilustración del pixel art del juego que es decorativa.
 */
// req: RQ-NEG-008 (estados con etiqueta humana)
@Component({
  imports: [UiEmptyState],
  template: `<ui-empty-state [kind]="kind()" [title]="title()" [description]="description()" [actionLabel]="actionLabel()"
    (action)="actions = actions + 1" />`,
})
class Host {
  kind = signal<UiEmptyKind>('first-use');
  title = signal<string | undefined>(undefined);
  description = signal<string | undefined>(undefined);
  actionLabel = signal<string | undefined>(undefined);
  actions = 0;
}

describe('ui-empty-state', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const root = () => (fixture.nativeElement as HTMLElement).querySelector('ui-empty-state') as HTMLElement;
  const text = (selector: string) => root().querySelector(selector)?.textContent?.trim();

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('las tres clases tienen textos por defecto distintos', async () => {
    const seen = new Set<string>();
    for (const kind of ['first-use', 'no-results', 'restricted'] as const) {
      host.kind.set(kind);
      await fixture.whenStable();
      expect(text('.ui-empty-state__title')).toBe(EMPTY_STATE_COPY[kind].title);
      expect(text('.ui-empty-state__description')).toBe(EMPTY_STATE_COPY[kind].description);
      seen.add(`${text('.ui-empty-state__title')}|${text('.ui-empty-state__description')}`);
      expect(root().classList).toContain(`ui-empty-state--${kind}`);
    }
    expect(seen.size).toBe(3);
  });

  it('sin resultados ofrece «Limpiar filtros» y la acción llega al consumidor', async () => {
    host.kind.set('no-results');
    await fixture.whenStable();
    // Es el resultado de una búsqueda del usuario: se anuncia sin mover el foco.
    expect(root().getAttribute('role')).toBe('status');
    const action = root().querySelector<HTMLButtonElement>('button[ui-button]')!;
    expect(action.textContent?.trim()).toBe('Limpiar filtros');
    action.click();
    expect(host.actions).toBe(1);
  });

  it('el texto propio reemplaza al del catálogo; sin acción no hay botón', async () => {
    host.kind.set('first-use');
    host.title.set('Aún no tienes grupos');
    host.description.set('Crea un grupo y comparte su código con tus estudiantes.');
    host.actionLabel.set('Crear grupo');
    await fixture.whenStable();
    expect(text('.ui-empty-state__title')).toBe('Aún no tienes grupos');
    expect(root().querySelector('button[ui-button]')?.textContent?.trim()).toBe('Crear grupo');

    host.kind.set('restricted');
    host.actionLabel.set(undefined);
    await fixture.whenStable();
    expect(root().querySelector('button[ui-button]')).toBeNull();
  });

  it('la ilustración es pixel art del juego, decorativa y a escala entera', async () => {
    for (const kind of ['first-use', 'no-results', 'restricted'] as const) {
      host.kind.set(kind);
      await fixture.whenStable();
      const art = root().querySelector<HTMLImageElement>('img.ui-empty-state__art')!;
      expect(art.getAttribute('alt')).toBe('');
      expect(art.getAttribute('src')).toMatch(/^\/assets\/game\//);
      const { width, height } = EMPTY_STATE_COPY[kind].art;
      expect(Number(art.getAttribute('width')) % width).toBe(0);
      expect(Number(art.getAttribute('height')) / height).toBe(Number(art.getAttribute('width')) / width);
    }
  });

  it('el título es un párrafo destacado, no un encabezado que rompa la jerarquía de la página', async () => {
    expect(root().querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
    expect(root().querySelector('p.ui-empty-state__title')).not.toBeNull();
  });
});
