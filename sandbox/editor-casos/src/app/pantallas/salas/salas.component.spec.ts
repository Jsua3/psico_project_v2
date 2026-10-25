import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import universidadJson from '../../../../public/assets/biblioteca/universidad/escenario.json';
import { routes } from '../../app.routes';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { Escenario } from '../../modelo/escenario';
import { SalasComponent } from './salas.component';

const universidad = universidadJson as unknown as Escenario;

async function montar() {
  localStorage.clear();
  await TestBed.configureTestingModule({
    imports: [SalasComponent],
    providers: [
      provideRouter(routes),
      { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SalasComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, raiz: fixture.nativeElement as HTMLElement };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(texto));

const marcadas = (raiz: HTMLElement) =>
  [...raiz.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter((c) => c.checked).map((c) => c.value);

describe('SalasComponent', () => {
  it('elegir un recorrido sugerido marca sus salas', async () => {
    const { fixture, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Atención en Bienestar"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(marcadas(raiz)).toEqual(['pasillo', 'sala-espera', 'consultorio']);
    expect(raiz.textContent).toContain('1. Pasillo de facultad, 2. Sala de espera de Bienestar, 3. Consultorio de atención psicológica');
  });

  it('el botón crear está deshabilitado sin salas', async () => {
    const { raiz } = await montar();
    const crear = boton(raiz, 'Crear el caso con estas salas')!;
    expect(crear.getAttribute('aria-disabled')).toBe('true');
    expect(raiz.textContent).toContain('Ninguna sala elegida');
  });

  it('crear guarda el caso y navega al editor', async () => {
    const { fixture, raiz } = await montar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Crisis en un espacio común"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();

    const caso = TestBed.inject(CasoStore).caso();
    expect(caso?.salas.map((s) => s.id)).toEqual(['cafeteria', 'enfermeria', 'consultorio']);
    expect(caso?.titulo).toBe('Crisis en un espacio común');
    expect(navegar).toHaveBeenCalledWith('/editor');
  });

  it('las flechas de orden cambian el orden de las escenas', async () => {
    const { fixture, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Atención en Bienestar"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    boton(raiz, 'Cambiar el orden')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Subir Sala de espera de Bienestar"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.textContent).toContain('1. Sala de espera de Bienestar, 2. Pasillo de facultad');
  });

  it('bajo el nombre dice cómo se llamará si queda vacío, sin prometer cambiarlo después', async () => {
    const { raiz } = await montar();
    const ayuda = raiz.querySelector('#nombre-caso')!.parentElement!.textContent!;
    expect(ayuda).not.toContain('Puedes cambiarlo después');
    expect(ayuda).toContain('Si lo dejas vacío, se llamará «Caso nuevo en la universidad».');
  });

  it('si ya hay un caso guardado, crear otro pide confirmación antes de borrarlo', async () => {
    const { fixture, raiz } = await montar();
    const store = TestBed.inject(CasoStore);
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Atención en Bienestar"]')!.click();
    await fixture.whenStable();
    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();
    const primero = store.caso()!;

    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.caso()).toBe(primero);
    const aviso = raiz.querySelector('[role="alertdialog"]')!;
    expect(aviso.textContent).toContain(`Ya tienes un caso guardado: «${primero.titulo}».`);

    boton(raiz, 'Cancelar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.caso()).toBe(primero);
    expect(raiz.querySelector('[role="alertdialog"]')).toBeNull();

    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    boton(raiz, 'Sí, crear uno nuevo')!.click();
    await fixture.whenStable();
    expect(store.caso()!.id).not.toBe(primero.id);
  });
});
