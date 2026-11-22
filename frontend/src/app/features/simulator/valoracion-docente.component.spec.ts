import { TestBed } from '@angular/core/testing';
import { OwnerEvaluation } from '../../core/models/simulation.model';
import { ValoracionDocenteComponent } from './valoracion-docente.component';

describe('ValoracionDocenteComponent', () => {
  const valoracion: OwnerEvaluation['evaluations'][number] = {
    rubricName: 'Rúbrica', origin: 'DOCENTE', evaluatedAt: null,
    comment: 'Comentario general', overallLevel: 'EN_PROCESO',
    criteria: [
      { criterionId: 123, title: 'Escucha', level: 'LOGRADO', descriptor: 'Escucha con atención', comment: 'Buena escucha' },
      { criterionId: 456, title: 'Reflexión', level: null, comment: '' },
    ],
  };
  it('muestra la espera cuando no hay valoración', () => {
    const fixture = TestBed.createComponent(ValoracionDocenteComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cuando tu docente revise tu recorrido');
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(0);
  });
  it('presenta comentario, niveles y criterios en orden sin exponer identificadores', () => {
    const fixture = TestBed.createComponent(ValoracionDocenteComponent);
    fixture.componentRef.setInput('valoracion', valoracion);
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Comentario general');
    expect(texto).toContain('En proceso');
    expect(texto).toContain('Logrado');
    expect(texto).toContain('Escucha con atención');
    expect(texto).toContain('Buena escucha');
    expect(texto).toContain('Sin nivel');
    expect(texto).toContain('Sin observación para este criterio.');
    expect(texto).not.toMatch(/123|456|EN_PROCESO|LOGRADO|%/);
    const items = fixture.nativeElement.querySelectorAll('li');
    expect(items[0].textContent).toContain('Escucha');
    expect(items[1].textContent).toContain('Reflexión');
    expect(items[1].querySelector('.valoracion__descriptor')).toBeNull();
  });
  it('actualiza la vista cuando cambia la entrada', () => {
    const fixture = TestBed.createComponent(ValoracionDocenteComponent);
    fixture.componentRef.setInput('valoracion', valoracion);
    fixture.detectChanges();
    fixture.componentRef.setInput('valoracion', null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Buena escucha');
    expect(fixture.nativeElement.textContent).toContain('retroalimentación aparecerá aquí');
  });
});
