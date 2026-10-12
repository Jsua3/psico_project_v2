import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { UiButton } from '../button/ui-button';
import { UiDialog, UiDialogActions, UiDialogFrame } from './ui-dialog';

/**
 * UiDialog (plan visual §2.7, F2-7; Review Focus 2): diálogo modal sobre @angular/cdk/dialog con el marco del
 * lenguaje visual. Trampa de foco, foco inicial dentro, Esc cierra, el foco VUELVE al disparador, aria-modal y
 * nombre por su título. confirm() con variante de peligro (el foco empieza en «Cancelar») y sheet() lateral o
 * inferior.
 */
// req: RNF-004 (diálogos operables con teclado; foco que vuelve, WCAG 2.4.3)
@Component({
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Editar grupo" description="Cambia el nombre que ven tus estudiantes.">
      <label>Nombre <input class="nombre" /></label>
      <button ui-button uiDialogActions type="button" variant="secondary" class="cerrar">Cerrar</button>
    </ui-dialog-frame>
  `,
})
class EditGroupDialog {
  readonly data = inject<{ group: string }>(DIALOG_DATA);
}

describe('UiDialog', () => {
  let trigger: HTMLButtonElement;
  const dialogs = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')];
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
  };
  const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    trigger = document.createElement('button');
    trigger.textContent = 'Abrir';
    document.body.appendChild(trigger);
    trigger.focus();
  });

  afterEach(() => trigger.remove());

  it('abre un diálogo modal nombrado por su título, con su descripción y los datos', async () => {
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, { data: { group: 'PSI-1' } });
    await settle();
    const [dialog] = dialogs();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('Editar grupo');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent?.trim())
      .toBe('Cambia el nombre que ven tus estudiantes.');
    expect(ref.componentInstance?.data.group).toBe('PSI-1');
    expect(dialog.querySelector('h2')?.textContent?.trim()).toBe('Editar grupo');
    ref.close();
    await settle();
  });

  it('el foco entra al diálogo, queda atrapado y vuelve al disparador al cerrar con Esc', async () => {
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    const [dialog] = dialogs();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // La trampa del CDK está montada: anclas enfocables antes y después del diálogo. Que el Tab cicle dentro lo
    // prueba el e2e de estados (F2-9) en Chromium: en jsdom no hay maquetación y el CDK no ve nada «visible».
    const anchors = [...dialog.parentElement!.querySelectorAll<HTMLElement>('.cdk-focus-trap-anchor')];
    expect(anchors.length).toBe(2);
    expect(anchors.every(anchor => anchor.getAttribute('tabindex') === '0')).toBe(true);
    expect(anchors[0].nextElementSibling).toBe(dialog);

    const closed = firstValueFrom(ref.closed);
    escape();
    await closed;
    await settle();
    expect(dialogs().length).toBe(0);
    expect(document.activeElement).toBe(trigger);
  });

  it('el botón de cerrar del marco cierra sin resultado', async () => {
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    const closed = firstValueFrom(ref.closed);
    dialogs()[0].querySelector<HTMLButtonElement>('.ui-dialog-frame__close')!.click();
    expect(await closed).toBeUndefined();
  });

  it('confirm(): alertdialog; «Confirmar» resuelve true y «Cancelar» o Esc resuelven false', async () => {
    const dialog = TestBed.inject(UiDialog);
    let answer = dialog.confirm({ title: 'Publicar caso', message: 'Lo verán tus estudiantes.', confirmLabel: 'Publicar' });
    await settle();
    expect(dialogs()[0].getAttribute('role')).toBe('alertdialog');
    const confirm = dialogs()[0].querySelector<HTMLButtonElement>('.ui-confirm__confirm')!;
    expect(confirm.textContent?.trim()).toBe('Publicar');
    expect(document.activeElement).toBe(confirm);
    confirm.click();
    expect(await answer).toBe(true);
    await settle();

    answer = dialog.confirm({ title: 'Publicar caso', message: 'x', confirmLabel: 'Publicar' });
    await settle();
    dialogs()[0].querySelector<HTMLButtonElement>('.ui-confirm__cancel')!.click();
    expect(await answer).toBe(false);
    await settle();

    answer = dialog.confirm({ title: 'Publicar caso', message: 'x', confirmLabel: 'Publicar' });
    await settle();
    escape();
    expect(await answer).toBe(false);
  });

  it('confirm() de peligro: botón rojo y el foco empieza en «Cancelar» (la opción segura)', async () => {
    const answer = TestBed.inject(UiDialog).confirm({
      title: 'Borrar grupo', message: 'Se borran también sus códigos.', confirmLabel: 'Borrar', tone: 'danger',
    });
    await settle();
    const [dialog] = dialogs();
    expect(dialog.querySelector('.ui-confirm__confirm')?.classList).toContain('ui-button--danger');
    expect(document.activeElement).toBe(dialog.querySelector('.ui-confirm__cancel'));
    escape();
    expect(await answer).toBe(false);
  });

  it('sheet(): hoja inferior o lateral con la misma accesibilidad', async () => {
    const dialog = TestBed.inject(UiDialog);
    for (const side of ['bottom', 'end'] as const) {
      const ref = dialog.sheet(EditGroupDialog, { side });
      await settle();
      expect(document.querySelector(`.ui-sheet-pane--${side}`)).not.toBeNull();
      expect(dialogs()[0].getAttribute('aria-modal')).toBe('true');
      const closed = firstValueFrom(ref.closed);
      escape();
      await closed;
      await settle();
    }
  });
});

/**
 * UiDialog.consequence() (plan visual F2-11; RN-07): la confirmación NOMBRA lo que se pierde y deja «Continuar» como
 * acción por defecto (primaria, con el foco, y lo que devuelven Esc o el fondo). No es para la Salida segura
 * (REGLA-004: salir nunca pide confirmación).
 */
// req: RN-07 (continuar el intento abierto es la opción por defecto)
describe('UiDialog.consequence', () => {
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
  };
  const options = {
    title: '¿Iniciar un intento nuevo?',
    consequence: 'Se cerrará el intento que tienes abierto y perderás su avance.',
    continueLabel: 'Continuar mi intento',
    proceedLabel: 'Iniciar uno nuevo',
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('alertdialog que describe la consecuencia; el foco empieza en «Continuar», primario', async () => {
    const answer = TestBed.inject(UiDialog).consequence(options);
    await settle();
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent?.trim()).toBe(options.consequence);
    const keep = dialog.querySelector<HTMLButtonElement>('.ui-consequence__continue')!;
    expect(keep.textContent?.trim()).toBe('Continuar mi intento');
    expect(keep.classList).toContain('ui-button--primary');
    expect(document.activeElement).toBe(keep);
    keep.click();
    expect(await answer).toBe('continue');
  });

  it('solo «proceder» devuelve proceed; Esc devuelve continue', async () => {
    const dialog = TestBed.inject(UiDialog);
    let answer = dialog.consequence(options);
    await settle();
    document.querySelector<HTMLButtonElement>('.ui-consequence__proceed')!.click();
    expect(await answer).toBe('proceed');
    await settle();

    answer = dialog.consequence(options);
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    expect(await answer).toBe('continue');
  });
});
