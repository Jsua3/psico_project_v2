import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { EditorComponent } from './editor.component';

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [EditorComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  const caso = copiarEscenarioAlCaso(universidad, ['pasillo', 'sala-espera', 'consultorio'], 'Caso');
  const [a, b] = caso.escenas;
  const valorar = caso.hitos.find((h) => h.clave === 'valorar_el_riesgo')!.clave;
  a.respuestas = [{
    id: 'r1', texto: 'Cuéntame cómo te sientes en casa.', clase: 'RECOMMENDED', razon: '', retroalimentacion: '', destinoId: b.id,
    efectos: { hitos: [valorar] }, marcaIa: false,
  }];
  b.intensidad = 'HIGH';
  caso.escenas[2].intensidad = 'LOW';
  store.fijar(caso);
  const fixture = TestBed.createComponent(EditorComponent);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); await new Promise((r) => setTimeout(r, 0)); };
  return { fixture, store, caso, valorar, raiz: fixture.nativeElement as HTMLElement, listo };
}

describe('EditorComponent · hitos del caso e intensidad de las escenas', () => {
  afterEach(() => document.querySelectorAll('app-root, [ng-version]').forEach((n) => n.remove()));

  it('el panel «Hitos del caso» lista el catálogo con dónde se cumple cada hito', async () => {
    const { raiz, caso, valorar } = await montar();
    const panel = raiz.querySelector('section.hitos-del-caso')!;
    expect(panel.querySelector('h2')!.textContent).toContain('Hitos del caso');
    const filas = [...panel.querySelectorAll<HTMLElement>('li.hito')];
    expect(filas.map((f) => f.querySelector('strong')!.textContent)).toEqual(caso.hitos.map((h) => h.nombre));
    const valorarFila = filas.find((f) => f.id === `hito-${valorar}`)!;
    expect(valorarFila.textContent).toContain('Se cumple en');
    expect(valorarFila.textContent).toContain('Cuéntame cómo te sientes en casa.');
    expect(valorarFila.textContent).toContain('Decide el final'); // el catálogo trae «Valorar el riesgo» como decisivo
  });

  it('un hito que ninguna respuesta marca avisa que es inalcanzable, con «Llévame ahí», también en «Por resolver»', async () => {
    const { raiz, caso } = await montar();
    const informar = caso.hitos.find((h) => h.clave === 'informar_derechos')!;
    const fila = raiz.querySelector<HTMLElement>(`li.hito[id="hito-${informar.clave}"]`)!;
    expect(fila.textContent).toContain(`El hito «${informar.nombre}» no se puede cumplir: ninguna respuesta lo marca.`);
    expect(fila.querySelector('button')!.textContent!.trim()).toBe('Llévame ahí');
    const avisos = [...raiz.querySelectorAll<HTMLElement>('section.avisos li')].map((li) => li.textContent!.replace(/\s+/g, ' '));
    expect(avisos.some((t) => t.includes('Por resolver') && t.includes(`El hito «${informar.nombre}» no se puede cumplir`))).toBe(true);
    expect(raiz.querySelector('li.hito[id="hito-valorar_el_riesgo"] .aviso-hito')).toBeNull(); // el que sí se cumple no avisa
  });

  it('cada escena muestra su intensidad con palabras, no solo con color', async () => {
    const { raiz } = await montar();
    const tarjetas = [...raiz.querySelectorAll<HTMLElement>('button.escena')];
    expect(tarjetas.map((t) => t.querySelector('.intensidad-marca')!.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Intensidad media'), expect.stringContaining('Intensidad alta'), expect.stringContaining('Intensidad baja'),
    ]);
  });

  it('en ninguna parte del editor aparece una cifra de estrés o de puntaje', async () => {
    const { raiz } = await montar();
    expect(raiz.textContent).not.toMatch(/estr[eé]s|puntaje|puntos/i);
  });
});
