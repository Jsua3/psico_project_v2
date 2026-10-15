import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RevisionConflictDialogComponent, RevisionConflictDialogData } from './revision-conflict-dialog.component';

/**
 * La comparación del 409 (RNF-08, REGLA-011): «Este caso cambió en otra sesión», con las dos revisiones y lo que
 * cambió, y dos salidas con nombre: «Reintentar» (aplica lo mío sobre la versión vigente) y «Recargar» (descarta lo
 * mío y carga la vigente).
 */
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('comparación del conflicto de revisión (F8-1)', () => {
  let fixture: ComponentFixture<RevisionConflictDialogComponent>;
  let ref: { close: ReturnType<typeof vi.fn> };
  const root = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')]
    .find(candidate => text(candidate.querySelector('.ui-button__label')) === label);

  async function render(data: Partial<RevisionConflictDialogData> = {}) {
    ref = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [RevisionConflictDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DialogRef, useValue: ref },
        {
          provide: DIALOG_DATA,
          useValue: {
            mineRevision: 5,
            currentRevision: 7,
            changes: ['Nodos: 1 nuevo.', 'Decisiones: 2 modificadas.'],
            ...data,
          } satisfies RevisionConflictDialogData,
        },
      ],
    });
    fixture = TestBed.createComponent(RevisionConflictDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // req: RNF-08, REGLA-011
  it('dice que el caso cambió en otra sesión, con las dos revisiones y la lista de cambios', async () => {
    await render();

    expect(text(root().querySelector('h2'))).toBe('Este caso cambió en otra sesión');
    expect(text(root())).toContain('Tu pantalla tenía la revisión 5 y el caso va en la 7.');
    expect([...root().querySelectorAll('li')].map(text)).toEqual(['Nodos: 1 nuevo.', 'Decisiones: 2 modificadas.']);
  });

  it('«Reintentar» y «Recargar» cierran con su respuesta', async () => {
    await render();

    button('Reintentar con mi cambio')!.click();
    expect(ref.close).toHaveBeenLastCalledWith('retry');

    button('Recargar el caso')!.click();
    expect(ref.close).toHaveBeenLastCalledWith('reload');
  });

  it('el foco inicial cae en la acción segura («Recargar el caso»: no pisa lo de la otra sesión)', async () => {
    await render();

    expect(root().querySelector('[data-autofocus]')).toBe(button('Recargar el caso'));
  });

  it('sin lista de cambios no pinta una lista vacía', async () => {
    await render({ changes: [] });

    expect(root().querySelector('ul')).toBeNull();
  });
});
