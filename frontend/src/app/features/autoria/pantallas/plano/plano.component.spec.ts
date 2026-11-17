import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { LAYOUT_HOSPITAL } from '../../../simulator/plano/plano-ejemplo.testing';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { CasoStore } from '../../estado/caso.store';
import type { CasoBorrador } from '../../modelo/caso';
import { faltasPorSala } from '../../modelo/salas-a-documento';
import { CASO_HOSPITAL } from '../../testing/hospital';
import { PlanoCasoComponent } from './plano.component';

const REGLAS = { anchos: [960, 1200, 1440, 1680, 1920], piezas: {}, clavesDePisos: [], muros: [], propios: [], tapetes: [] };

async function montar(plano: unknown, caso: CasoBorrador = structuredClone(CASO_HOSPITAL)) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PlanoCasoComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogoDePiezas, useValue: { manifiesto: signal(null), reglas: signal(REGLAS), error: signal(false) } },
      { provide: AutoriaApiService, useValue: { api: { casePlan: () => of(plano) } } },
    ],
  }).compileComponents();
  TestBed.inject(CasoStore).fijar(caso);
  const fixture = TestBed.createComponent(PlanoCasoComponent);
  fixture.detectChanges();
  // El plano se pide tras esperar a que no quede nada por guardar: unas vueltas del bucle de tareas.
  for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r)); await fixture.whenStable(); fixture.detectChanges(); }
  return { fixture, raiz: fixture.nativeElement as HTMLElement, caso };
}

describe('PlanoCasoComponent', () => {
  it('un clic en una sala abre su editor', async () => {
    const { raiz } = await montar(LAYOUT_HOSPITAL);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const botones = raiz.querySelectorAll<HTMLButtonElement>('button.plano__sala');
    expect(botones).toHaveLength(LAYOUT_HOSPITAL.rooms.length);
    botones[0].click();
    expect(navegar).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/editor/sala/${LAYOUT_HOSPITAL.rooms[0].key}$`)));
    // Todas las salas llevan su nombre: la docente ve el plano entero, sin «estás aquí».
    expect(raiz.querySelectorAll('g.sala--visitada')).toHaveLength(LAYOUT_HOSPITAL.rooms.length);
    expect(raiz.querySelector('circle.aqui')).toBeNull();
  });

  it('una puerta sin regreso sale en rojo con su texto', async () => {
    const caso = structuredClone(CASO_HOSPITAL);
    // Se quita la vuelta de una puerta: su origen queda con una falta OCL-15.
    const origen = caso.salas.find(s => s.estructura && s.puertas.some(p => p.hacia && p.muro !== undefined && caso.salas.some(d => d.id === p.hacia)))!;
    const puerta = origen.puertas.find(p => p.hacia && p.muro !== undefined)!;
    const destino = caso.salas.find(s => s.id === puerta.hacia)!;
    destino.puertas = destino.puertas.filter(p => p.hacia !== origen.id);
    const faltas = (faltasPorSala(caso, REGLAS).get(origen.id) ?? []).filter(f => f.regla === 'OCL-15' && f.elemento.tipo === 'puerta');
    expect(faltas.length, 'la prueba necesita una puerta sin regreso').toBeGreaterThan(0);
    const plano = { rooms: [{ key: origen.id, title: origen.nombre, width: origen.estructura!.ancho, frame: origen.encuadre, plan: { x: 0, y: 0 }, visited: false }], doors: [] };
    const { raiz } = await montar(plano, caso);
    expect(raiz.querySelector(`g.rota[data-rota="${origen.id}"]`)!.textContent).toContain('×');
    expect(raiz.querySelector('.plano__rota')!.textContent).toBe(faltas[0].mensaje);
  });

  it('sin salas por piezas muestra el aviso', async () => {
    const { raiz } = await montar(null);
    expect(raiz.textContent).toContain('Este caso no tiene salas por piezas: el plano aparece cuando las tiene.');
    expect(raiz.querySelector('app-plano-del-lugar')).toBeNull();
  });
});
