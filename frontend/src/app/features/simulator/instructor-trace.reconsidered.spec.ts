import { readFileSync } from 'fs';
import { join } from 'path';

import { AttemptTimelineEntry, TraceEvent } from '../../core/models/simulation.model';
import { InstructorTraceComponent } from './instructor-trace.component';
import { RECONSIDERED_LABEL } from './reconsidered.util';

/**
 * L-02: la primera respuesta que el juego no aplicó (reintento) ya no se pinta como «Contraindicada» mientras el
 * contador de contraindicadas dice 0. Se ejercitan los ayudantes de presentación sobre el prototipo (el componente
 * inyecta servicios que aquí no hacen falta) y la plantilla como texto, que Jest no renderiza.
 */
const source = readFileSync(join(__dirname, 'instructor-trace.component.ts'), 'utf-8');
const panel = Object.create(InstructorTraceComponent.prototype) as InstructorTraceComponent;

const entry = (overrides: Partial<AttemptTimelineEntry>): AttemptTimelineEntry => ({
  atSeconds: 10, time: '00:10', type: 'DECISION_SELECTED', classification: null, prohibited: false,
  label: 'Etiqueta', scoreDelta: 0, stressDelta: 0, ...overrides,
});

const prohibitedRetry = entry({ type: 'PROHIBITED_DECISION_RETRY_REQUIRED', classification: 'INADEQUATE', prohibited: true });
const riskyRetry = entry({ type: 'DECISION_RETRY_REQUIRED', classification: 'RISKY', prohibited: false });
const prohibitedRegistered = entry({ type: 'PROHIBITED_DECISION_SELECTED', classification: 'INADEQUATE', prohibited: true });

describe('panel del docente: respuestas reconsideradas (L-02)', () => {
  it('una fila de reintento lleva la etiqueta «Primera respuesta no aplicada (reintento)», sea prohibida o riesgosa', () => {
    expect(panel.timelineEntryLabel(prohibitedRetry)).toBe(RECONSIDERED_LABEL);
    expect(panel.timelineEntryLabel(riskyRetry)).toBe(RECONSIDERED_LABEL);
  });

  it('una decisión prohibida registrada sigue siendo «Contraindicada» (el contador sí la cuenta)', () => {
    expect(panel.timelineEntryLabel(prohibitedRegistered)).toBe('Contraindicada');
  });

  it('la fila de reintento no se pinta de rojo ni con la insignia de contraindicación', () => {
    expect(panel.timelineEntryClass(prohibitedRetry)).toBe('');
    expect(panel.timelineBadgeClass(prohibitedRetry)).toBe('');
    expect(panel.timelineEntryClass(prohibitedRegistered)).toBe('trace-event-card--inadequate');
    expect(panel.timelineBadgeClass(prohibitedRegistered)).toBe('pixel-badge--pending');
  });

  it('el texto de apoyo de la fila de reintento explica que no cuenta como decisión registrada', () => {
    expect(panel.timelineFeedback(prohibitedRetry)).toMatch(/no cuenta como decisión registrada/);
    expect(panel.timelineFeedback(prohibitedRetry)).not.toMatch(/contraindicado/);
    expect(panel.timelineFeedback(prohibitedRegistered)).toBe('Evento marcado como contraindicado en el recorrido del estudiante.');
  });

  it('el título de un evento de reintento no lo llama «decisión inadecuada»', () => {
    const retryEvent = { type: 'PROHIBITED_DECISION_RETRY_REQUIRED', classification: 'INADEQUATE' } as TraceEvent;
    expect(panel.eventTitle(retryEvent)).toBe(RECONSIDERED_LABEL);
    expect(panel.eventTitle({ type: 'DECISION_SELECTED', classification: 'RISKY' } as TraceEvent)).toBe('Decisión riesgosa');
  });

  it('la plantilla usa la insignia propia de la línea de tiempo y muestra el contador de reconsideradas', () => {
    expect(source.match(/\[ngClass\]="timelineBadgeClass\(entry\)"/g)?.length).toBe(2);
    expect(source).toMatch(/@if \(item\.retries\) \{\s*<span class="pixel-badge">Reconsideradas: \{\{ item\.retries \}\}<\/span>/);
  });
});
