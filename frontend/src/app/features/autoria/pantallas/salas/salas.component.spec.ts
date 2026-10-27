import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { of } from 'rxjs';

import { AuthoringApi } from '../../../../core/api/authoring.api';

import { universidad } from '../../testing/universidad';
import { rutasDePrueba } from '../../testing/rutas';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { Escenario } from '../../modelo/escenario';
import { SalasComponent } from './salas.component';


async function montar(createCase = vi.fn(() => of({ caseVersionId: 77 }))) {
  await TestBed.configureTestingModule({
    imports: [SalasComponent],
    providers: [
      provideRouter(rutasDePrueba),
      { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
      { provide: AuthoringApi, useValue: { createCase } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SalasComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, raiz: fixture.nativeElement as HTMLElement, createCase };
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

  it('crear manda el lugar y las salas elegidas, en su orden, y abre el editor del caso creado', async () => {
    const { fixture, raiz, createCase } = await montar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Crisis en un espacio común"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();

    expect(createCase).toHaveBeenCalledWith({ title: 'Crisis en un espacio común', lugarId: 'universidad', salas: ['cafeteria', 'enfermeria', 'consultorio'] });
    expect(navegar).toHaveBeenCalledWith('/portal/casos/77/editor');
  });

  it('si el servidor no lo crea, lo dice y deja volver a intentarlo', async () => {
    const { fixture, raiz, createCase } = await montar(vi.fn(() => throwError(() => new Error('falla'))));
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Atención en Bienestar"]')!.click();
    await fixture.whenStable();
    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('No se pudo crear el caso');
    expect(navegar).not.toHaveBeenCalled();
    expect(boton(raiz, 'Crear el caso con estas salas')).toBeTruthy(); // el botón vuelve a estar disponible
    expect(createCase).toHaveBeenCalledTimes(1);
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
});
