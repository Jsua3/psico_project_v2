import { TestBed } from '@angular/core/testing';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { CamaraEscenaComponent } from './camara-escena.component';

describe('EDITOR-PRO · cámara de la escena', () => {
  it('encuadra al hablante de la esquina, sigue la línea y permite ver toda la sala', async () => {
    const caso = copiarEscenarioAlCaso(universidad, ['sala-espera'], 'Caso');
    const sala = caso.salas[0];
    const escena = caso.escenas[0];
    const persona = sala.personajes[0];
    sala.personajes = [{ ...persona, x: 0, y: 0 }, { ...persona, ref: 'otra', x: 960, y: 528 }];
    escena.lineas = [
      { id: 'a', personajeId: persona.ref, texto: 'Hola', expresion: 'neutral', marcaIa: false },
      { id: 'b', personajeId: 'otra', texto: 'Hola', expresion: 'neutral', marcaIa: false },
    ];
    await TestBed.configureTestingModule({ imports: [CamaraEscenaComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CamaraEscenaComponent);
    fixture.componentRef.setInput('caso', caso);
    fixture.componentRef.setInput('escena', escena);
    fixture.componentRef.setInput('lineaEnfocada', 'a');
    fixture.detectChanges();
    const mundo = fixture.nativeElement.querySelector('.camara__mundo') as HTMLElement;
    expect(mundo.style.transform).toContain('translate(0%, 0%) scale(2)');
    fixture.componentRef.setInput('lineaEnfocada', 'b');
    fixture.detectChanges();
    expect(mundo.style.transform).toContain('translate(-100%, -100%) scale(2)');
    (fixture.nativeElement.querySelector('.camara__alternar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(mundo.style.transform).toContain('scale(1)');
  });
  it('RF-05 ? sit?a actores sobre la composici?n completa de una sala estrecha', async () => {
    const caso = copiarEscenarioAlCaso(universidad, ['sala-espera'], 'Caso');
    const sala = caso.salas[0];
    sala.fondo = '';
    sala.estructura = { ancho: 640 } as typeof sala.estructura;
    sala.personajes = [{ ...sala.personajes[0], x: 320, y: 264 }];
    await TestBed.configureTestingModule({ imports: [CamaraEscenaComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CamaraEscenaComponent);
    fixture.componentRef.setInput('caso', caso);
    fixture.componentRef.setInput('escena', caso.escenas[0]);
    fixture.componentRef.setInput('miniatura', 'blob:completa');
    fixture.detectChanges();
    const cuadro = fixture.nativeElement.querySelector('.camara__cuadro') as HTMLElement;
    const actor = fixture.nativeElement.querySelector('.actor') as HTMLElement;
    expect(cuadro.style.aspectRatio).toBe('640 / 528');
    expect(actor.style.left).toBe('50%');
    expect(actor.style.top).toBe('50%');
  });
});
