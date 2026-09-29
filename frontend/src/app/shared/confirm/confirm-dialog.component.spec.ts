import { TestBed } from '@angular/core/testing';

import { ConfirmDialogComponent } from './confirm-dialog.component';

// ts-jest no aplica la transformación JIT de Angular a los inputs con signals,
// así que `setInput` falla con NG0303; se escribe el nodo interno como en
// dialogue-panel.component.spec.ts.
type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

describe('ConfirmDialogComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ConfirmDialogComponent] }));

  function render(loading = false) {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    writeInputSignal(fixture.componentInstance.open, true);
    writeInputSignal(fixture.componentInstance.loading, loading);
    writeInputSignal(fixture.componentInstance.message, 'Se eliminará el grupo.');
    fixture.detectChanges();
    const cancelSpy = jest.fn();
    fixture.componentInstance.cancel.subscribe(cancelSpy);
    return { fixture, cancelSpy, root: fixture.nativeElement as HTMLElement };
  }

  it('se anuncia como alerta con título y descripción', () => {
    const { root } = render();
    const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const describedBy = panel.getAttribute('aria-describedby') as string;
    expect(root.querySelector(`#${describedBy}`)?.textContent).toContain('Se eliminará el grupo.');
  });

  it('Esc cancela', () => {
    const { root, cancelSpy } = render();
    root.querySelector('[role="alertdialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('Esc no cancela mientras procesa', () => {
    const { root, cancelSpy } = render(true);
    root.querySelector('[role="alertdialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('clic en el fondo cancela; clic dentro del panel no', () => {
    const { root, cancelSpy } = render();
    (root.querySelector('[role="alertdialog"]') as HTMLElement).click();
    expect(cancelSpy).not.toHaveBeenCalled();
    (root.querySelector('.confirm-backdrop') as HTMLElement).click();
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('el foco inicial va a «Cancelar» y queda atrapado en el panel', () => {
    const { root } = render();
    const [cancelButton] = Array.from(root.querySelectorAll('button'));
    expect(cancelButton.textContent).toContain('Cancelar');
    expect(cancelButton.hasAttribute('cdkFocusInitial')).toBe(true);
    expect(root.querySelector('[cdkTrapFocus]')).not.toBeNull();
  });

  it('dos diálogos no comparten ids', () => {
    const first = render().root.querySelector('h3')!.id;
    const second = render().root.querySelector('h3')!.id;
    expect(first).not.toBe(second);
  });
});
