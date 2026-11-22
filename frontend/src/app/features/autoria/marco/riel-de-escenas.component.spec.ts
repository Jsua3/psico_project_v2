import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { abrirEditor } from './marco.testing';

// req: EDITOR.md §4.1 (el riel de escenas, versión básica de E0) y §7.3 E0 (compatibilidad: el riel solo en Historia)
describe('RielDeEscenasComponent', () => {
  afterEach(() => document.querySelectorAll('body > [ng-version]').forEach((n) => n.remove()));

  it('en la etapa Historia lista las escenas en orden con número, título y estado, y marca la abierta', async () => {
    const { raiz, store, harness, listo } = await abrirEditor('/portal/casos/41/editor');
    expect(raiz.querySelector('app-riel-de-escenas')).not.toBeNull();
    const primera = store.caso()!.escenas[0];
    await harness.navigateByUrl(`/portal/casos/41/editor/escena/${primera.id}`);
    await listo();
    const filas = [...raiz.querySelectorAll<HTMLAnchorElement>('app-riel-de-escenas .riel__lista a')];
    expect(filas).toHaveLength(store.caso()!.escenas.length);
    expect(filas[0].querySelector('.riel__numero')!.textContent).toBe('1');
    expect(filas[0].getAttribute('title')).toBe(primera.titulo);
    expect(filas[0].getAttribute('aria-label')).toMatch(new RegExp(`^Escena 1, ${primera.titulo}: `));
    expect(filas[0].getAttribute('aria-current')).toBe('page');
    expect(filas.every((a) => !!a.querySelector('.marca-estado')!.getAttribute('data-estado'))).toBe(true);
  });

  it('«Siguiente paso» está arriba y lleva al sitio', async () => {
    const { raiz, listo, store } = await abrirEditor('/portal/casos/41/editor');
    const boton = raiz.querySelector<HTMLButtonElement>('app-riel-de-escenas [data-accion="siguiente-paso"]')!;
    expect(boton.textContent!.trim().length).toBeGreaterThan(0);
    // Con una escena vacía, el paso es escribirla.
    const vacia = store.caso()!.escenas.find((e) => !e.lineas.length && !e.respuestas.length);
    if (vacia) {
      expect(boton.textContent).toContain('Escribe la escena');
      boton.click();
      await listo();
      await new Promise((r) => setTimeout(r, 0));
      expect(TestBed.inject(Router).url).toContain('/editor/escena/');
    }
  });

  it('fuera de la etapa Historia no se pinta: el contenido ocupa todo el ancho', async () => {
    const { raiz } = await abrirEditor('/portal/casos/41/editor/datos');
    expect(raiz.querySelector('app-riel-de-escenas')).toBeNull();
    expect(raiz.querySelector('.cuerpo')!.classList).not.toContain('con-riel');
  });

  it('en el teléfono el riel es un selector «Escena N de M»', async () => {
    const { raiz, store } = await abrirEditor('/portal/casos/41/editor');
    const opciones = [...raiz.querySelectorAll<HTMLOptionElement>('app-riel-de-escenas select option')].map((o) => o.textContent!.trim());
    expect(opciones[0]).toBe('Todas las escenas y sus caminos');
    expect(opciones[1].startsWith(`Escena 1 de ${store.caso()!.escenas.length} · ${store.caso()!.escenas[0].titulo}`)).toBe(true);
    // Un select no lleva iconos: el estado de cada escena va en palabras.
    const vacia = store.caso()!.escenas[0].lineas.length === 0 && store.caso()!.escenas[0].respuestas.length === 0;
    if (vacia) expect(opciones[1]).toMatch(/ · por escribir$/);
  });
});
