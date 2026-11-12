import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import type { ValidationIssue } from '../../../../core/models/simulation.model';
import { CasoStore } from '../../estado/caso.store';
import { casoCopiadoDeLugar, listaDelServidor } from '../../testing/caso-api';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';
import { RevisionComponent } from './revision.component';

const CASO = 41;

/** Un caso sin nada que resolver en el editor: dos escenas, una respuesta recomendada que cumple todos los hitos y un final. */
function casoLimpio() {
  const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  const [a, b] = datos.editor.nodes;
  b.terminal = true;
  datos.editor.decisions.push({
    id: 900, optionKey: 'opcion-1', sourceNodeId: a.id, sourceKey: a.key, targetNodeId: b.id, targetKey: b.key, text: 'Te escucho.',
    responseClass: 'RECOMMENDED', prohibitedConduct: false, prohibitionReason: null, immediateFeedback: '', feedbackText: 'Escuchar da seguridad.',
    consequenceText: '', theoryBasis: '', aiSuggested: false, requires: {}, reaction: {}, effects: { milestones: datos.editor.rules.milestones.map((m) => m.key) },
  });
  return datos;
}

async function montar(opciones: { hallazgos?: ValidationIssue[]; estado?: string; revision?: ServidorFalso['ultimaRevision']; bloqueos?: ServidorFalso['bloqueos']; marcados?: string[]; constancia?: boolean } = {}) {
  localStorage.clear();
  TestBed.resetTestingModule();
  const datos = casoLimpio();
  if (opciones.estado) datos.editor.status = opciones.estado;
  if (opciones.marcados) datos.editor.checklist = listaDelServidor(opciones.marcados, { constancia: opciones.constancia });
  const servidor = new ServidorFalso(datos, universidad);
  servidor.hallazgos = opciones.hallazgos ?? [];
  servidor.bloqueos = opciones.bloqueos ?? [];
  servidor.ultimaRevision = opciones.revision;
  await TestBed.configureTestingModule({
    imports: [RevisionComponent],
    providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  const fixture = TestBed.createComponent(RevisionComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); await new Promise((r) => setTimeout(r, 0)); await fixture.whenStable(); fixture.detectChanges(); };
  await listo();
  const raiz = fixture.nativeElement as HTMLElement;
  const enviar = () => [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Enviar a Psicología')!;
  return { fixture, store, servidor, raiz, listo, enviar };
}

const issue = (code: string, mensaje: string, extra: Partial<ValidationIssue> = {}): ValidationIssue => ({ code, severity: 'error', message: mensaje, ...extra });

describe('RevisionComponent · la compuerta de publicación en lenguaje del docente', () => {
  afterEach(() => document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()));

  it('un caso sin nada que resolver puede enviarse', async () => {
    const { raiz, enviar, servidor } = await montar();
    expect(servidor.metodos).toEqual(['validateCase', 'lifecycle']);
    expect(raiz.textContent).toContain('Nada por resolver.');
    expect(enviar().getAttribute('aria-disabled')).not.toBe('true');
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('Borrador');
  });

  it('la revisión lista los seis códigos del validador en lenguaje del docente con «Llévame ahí»', async () => {
    const { raiz } = await montar({
      hallazgos: [
        issue('scene-without-recommended', 'La escena «Consultorio» no tiene ninguna respuesta recomendada: marca al menos una como «Recomendada».', { sceneKey: 'consultorio', nodeId: 1 }),
        issue('contraindicated-without-reason', 'La respuesta «Te escucho.» de la escena «Consultorio» es contraindicada y no explica por qué: escribe el motivo de la prohibición.', { sceneKey: 'consultorio', nodeId: 1, optionKey: 'opcion-1' }),
        issue('milestone-unreachable', 'El hito «Informar derechos» no se puede cumplir: ninguna respuesta de las escenas a las que se llega desde el inicio lo marca.', { milestoneKey: 'informar_derechos' }),
        issue('ending-unreachable', 'El final «Intervención protectora» no se puede alcanzar: ningún recorrido completo cumple su condición.', { endingKey: 'protectora' }),
        issue('competency-without-evidence', 'La competencia «Escucha activa» de la rúbrica no tiene evidencia: ninguna respuesta del caso la declara.', { competencyCode: 'ESCUCHA_ACTIVA' }),
        issue('high-intensity-without-warning', 'La escena «Pasillo» es de intensidad alta y no tiene mensaje de advertencia: escríbelo antes de publicar.', { sceneKey: 'pasillo', nodeId: 2 }),
      ],
    });
    const filas = [...raiz.querySelectorAll<HTMLElement>('section.por-resolver li.falta')];
    expect(filas).toHaveLength(6);
    expect(raiz.querySelector('section.por-resolver h2')!.textContent).toContain('Por resolver (6)');
    for (const fila of filas) {
      const boton = fila.querySelector('button')!;
      expect(boton.textContent!.trim()).toBe('Llévame ahí');
      expect(boton.getAttribute('aria-label')).toMatch(/^Llévame ahí: /);
    }
    expect(filas.map((f) => f.querySelector('p')!.textContent)).toEqual([
      expect.stringContaining('no tiene ninguna respuesta recomendada'),
      expect.stringContaining('es contraindicada y no explica por qué'),
      expect.stringContaining('no se puede cumplir'),
      expect.stringContaining('no se puede alcanzar'),
      expect.stringContaining('no tiene evidencia'),
      expect.stringContaining('intensidad alta'),
    ]);
    // ni códigos ni jerga en pantalla
    expect(raiz.textContent).not.toMatch(/scene-without|contraindicated-without|milestone-unreachable|WORLD\.|DSL\.|nodeId/);
  });

  it('«Llévame ahí» abre la escena, la respuesta, el hito o el final concretos y les da el foco', async () => {
    const { raiz, store, listo } = await montar({
      hallazgos: [issue('milestone-unreachable', 'El hito «Informar derechos» no se puede cumplir.', { milestoneKey: 'informar_derechos' })],
    });
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    // el elemento al que debe llegar el foco (la pantalla de destino lo dibujaría)
    const destino = document.createElement('li');
    destino.id = 'hito-informar_derechos';
    document.body.appendChild(destino);
    raiz.querySelector<HTMLButtonElement>('section.por-resolver li.falta button')!.click();
    await new Promise((r) => setTimeout(r, 120));
    await listo();
    expect(navegar).toHaveBeenCalledWith(`/portal/casos/${store.caso()!.id}/editor`);
    expect(document.activeElement).toBe(destino);
    destino.remove();
  });

  it('una escena con respuestas en una sala sin personas bloquea el envío y «Llévame ahí» abre la sala', async () => {
    const { raiz, store, enviar, listo } = await montar();
    // El consultorio se queda sin su única persona (el caso ya trae una respuesta en esa escena).
    const caso = structuredClone(store.caso()!);
    caso.salas.find((x) => x.id === 'consultorio')!.personajes = [];
    store.fijar(caso);
    await listo();
    const mensaje = 'La escena «Consultorio de atención psicológica» tiene respuestas pero en su sala no hay nadie con quien hablar. Agrega una persona.';
    const filas = [...raiz.querySelectorAll('section.por-resolver li.falta p')].map((p) => p.textContent);
    expect(filas).toEqual([mensaje]);
    expect(enviar().getAttribute('aria-disabled')).toBe('true');
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const destino = document.createElement('h3');
    destino.id = 'catalogo';
    document.body.appendChild(destino);
    raiz.querySelector<HTMLButtonElement>('section.por-resolver li.falta button')!.click();
    await new Promise((r) => setTimeout(r, 120));
    await listo();
    expect(navegar).toHaveBeenCalledWith(`/portal/casos/${store.caso()!.id}/editor/sala/consultorio`);
    expect(document.activeElement).toBe(destino);
    destino.remove();
  });

  it('un bloqueo de la compuerta que no es de un hallazgo (la lista de verificación) se muestra y no deja enviar', async () => {
    const mensaje = 'El checklist ético y académico debe estar al 100% antes de enviar el caso a revisión.';
    const { raiz, servidor, enviar, listo } = await montar({ bloqueos: [{ code: 'CHECKLIST_INCOMPLETE', message: mensaje }] });
    expect([...raiz.querySelectorAll('section.por-resolver li.falta p')].map((p) => p.textContent)).toEqual([mensaje]);
    expect(enviar().getAttribute('aria-disabled')).toBe('true');
    enviar().click();
    await listo();
    expect(servidor.llamadasA('transitionCase')).toHaveLength(0);
  });

  it('enviar llama a lifecycle submit y muestra el estado «En revisión»', async () => {
    const { raiz, servidor, store, enviar, listo } = await montar();
    const mensaje = raiz.querySelector<HTMLTextAreaElement>('textarea#mp')!;
    mensaje.value = 'Mira con cuidado el final.';
    mensaje.dispatchEvent(new Event('input'));
    enviar().click();
    await store.sincronizado();
    await listo();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    const envio = servidor.llamadasA('transitionCase')[0];
    expect(envio.args[0]).toEqual({ action: 'submit', note: 'Mira con cuidado el final.' });
    expect(envio.revision).toBe(3);
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('En revisión');
    expect(raiz.querySelector('[role="status"].listo')!.textContent).toContain('El caso está en revisión de Psicología');
    expect(raiz.textContent).toContain('Se puede ver, pero no editar.');
    expect([...raiz.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Enviar a Psicología')).toBe(false);
    expect(store.soloLectura()).toBe(true);
  });

  it('si la compuerta rechaza el envío, el caso sigue siendo un borrador y la lista muestra por qué', async () => {
    const { raiz, servidor, store, enviar, listo } = await montar();
    servidor.bloqueos = [{
      code: 'VALIDATION_ERRORS', message: 'El caso tiene 1 error.',
      issues: [issue('milestone-unreachable', 'El hito «Informar derechos» no se puede cumplir.', { milestoneKey: 'informar_derechos' })],
    }];
    enviar().click();
    await store.sincronizado().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('Borrador');
    expect(raiz.querySelector('section.por-resolver')!.textContent).toContain('El hito «Informar derechos» no se puede cumplir.');
    expect(store.soloLectura()).toBe(false);
  });

  it('A4 · si otra persona cambió el caso, enviar no dice «vuelve a intentarlo»: manda a recargar', async () => {
    const { raiz, servidor, store, enviar, listo } = await montar();
    servidor.otraSesionEscribe();
    enviar().click();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(store.conflicto()).not.toBeNull();
    const aviso = raiz.querySelector('#eph')!.textContent!;
    expect(aviso).toContain('Otra persona cambió el caso');
    expect(aviso).toContain('Recarga');
    expect(aviso).not.toContain('vuelve a intentarlo en un momento');
    expect(store.soloLectura()).toBe(false);
  });

  it('A5 · el resumen nombra el lugar del caso, no uno fijo', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('section.resumen p')!.textContent).toContain(`${universidad.nombre} · 2 escenas`);
  });

  it('A5 · un caso sin lugar no nombra ninguno', async () => {
    const { raiz, store, listo, fixture } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.lugarId = null;
    store.fijar(caso);
    fixture.detectChanges();
    await listo();
    const texto = raiz.querySelector('section.resumen p')!.textContent!.trim();
    expect(texto).toMatch(/^2 escenas · /);
    expect(texto).not.toContain(universidad.nombre);
  });

  it('un caso que ya está en revisión se ve así y no ofrece enviar', async () => {
    const { raiz } = await montar({ estado: 'IN_REVIEW' });
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('En revisión');
    expect([...raiz.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Enviar a Psicología')).toBe(false);
    expect(raiz.textContent).toContain('Se puede ver, pero no editar.');
  });

  it('en ninguna parte aparece una cifra de estrés o de puntaje', async () => {
    const { raiz } = await montar();
    expect(raiz.textContent).not.toMatch(/estr[eé]s|puntaje|puntos/i);
  });
});

describe('RevisionComponent · lista de verificación ética y académica', () => {
  afterEach(() => document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()));
  const OBLIGATORIOS = ['contentOriginal', 'ethicsReviewed', 'safetyProtocols', 'noStigmatizing', 'triggerWarnings', 'accessibilityOk'];
  const casilla = (raiz: HTMLElement, codigo: string) => raiz.querySelector<HTMLInputElement>(`#lista-verificacion input[data-codigo="${codigo}"]`)!;

  it('muestra los ítems que da el editor con casillas, si son obligatorios y quién los respalda', async () => {
    const { raiz } = await montar({ marcados: ['contentOriginal'] });
    const seccion = raiz.querySelector('section#lista-verificacion')!;
    expect(seccion.querySelector('h2')!.textContent).toContain('Lista de verificación');
    const filas = [...seccion.querySelectorAll<HTMLElement>('li.item-lista')];
    expect(filas).toHaveLength(7);
    expect(casilla(raiz, 'contentOriginal').checked).toBe(true);
    expect(casilla(raiz, 'ethicsReviewed').checked).toBe(false);
    expect(filas[0].textContent).toContain('Contenido original');
    expect(filas[0].textContent).toContain('Obligatorio');
    expect(filas[0].textContent).toContain('Declaración de quien autora el caso');
    expect(filas[6].textContent).toContain('Opcional');
    expect(filas[6].textContent).toContain('Texto pendiente de validar con Psicología');
    // un ítem que el sistema comprueba y todavía no tiene su respaldo lo dice: marcarlo no basta
    expect(filas[2].textContent).toContain('Lo comprueba el sistema');
    expect(filas[2].textContent).toContain('Marcarla no basta: todavía no existe en el caso lo que la respalda.');
    expect(filas[4].textContent).not.toContain('Marcarla no basta');
    expect(seccion.textContent).toContain('Pendiente: la constancia la registra Psicología al aprobar el caso; no es una casilla tuya.');
    expect(seccion.textContent).not.toMatch(/estr[eé]s|puntaje|puntos/i);
  });

  it('con la constancia registrada lo dice', async () => {
    const { raiz } = await montar({ marcados: [], constancia: true });
    expect(raiz.querySelector('#lista-verificacion')!.textContent).toContain('Constancia de Psicología registrada');
  });

  it('un caso cuyo editor no trae lista no muestra la sección', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('#lista-verificacion')).toBeNull();
  });

  it('con ítems obligatorios sin marcar lo lista en «Por resolver», no deja enviar y «Llévame ahí» lleva a la lista', async () => {
    const { raiz, enviar, store, listo } = await montar({ marcados: [] });
    const falta = raiz.querySelector('section.por-resolver li.falta')!;
    expect(falta.querySelector('p')!.textContent).toBe('Falta completar la lista de verificación: marca todos los ítems obligatorios.');
    expect(enviar().getAttribute('aria-disabled')).toBe('true');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    falta.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise((r) => setTimeout(r, 120));
    await listo();
    expect(navegar).toHaveBeenCalledWith('/portal/casos/41/editor/revision'); // la lista está en esta misma pantalla, no en el editor anterior
    expect(store.caso()!.lista!.items).toHaveLength(7);
    expect(document.activeElement).toBe(raiz.querySelector('#lista-verificacion'));
  });

  it('marcar los obligatorios los guarda con la revisión vigente y habilita el envío', async () => {
    const { raiz, servidor, store, enviar, listo } = await montar({ marcados: [] });
    for (const codigo of OBLIGATORIOS) {
      casilla(raiz, codigo).click();
      await listo();
    }
    await store.sincronizado();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    const guardados = servidor.llamadasA('updateChecklist');
    expect(guardados).toHaveLength(OBLIGATORIOS.length);
    expect(guardados.map((g) => g.revision)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(guardados.at(-1)!.args[0]).toMatchObject({ contentOriginal: true, accessibilityOk: true, scopeEducational: false });
    expect(raiz.textContent).toContain('Nada por resolver.');
    expect(enviar().getAttribute('aria-disabled')).not.toBe('true');
    enviar().click();
    await store.sincronizado();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(servidor.llamadasA('transitionCase')).toHaveLength(1);
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('En revisión');
  });

  it('desmarcar un obligatorio vuelve a pedir la lista', async () => {
    const { raiz, store, listo } = await montar({ marcados: OBLIGATORIOS });
    expect(raiz.textContent).toContain('Nada por resolver.');
    casilla(raiz, 'ethicsReviewed').click();
    await store.sincronizado();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(raiz.querySelector('section.por-resolver')!.textContent).toContain('Falta completar la lista de verificación');
  });
});

describe('RevisionComponent · un caso que ya no es un borrador (decisión de Psicología y versión nueva)', () => {
  afterEach(() => document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()));

  it('en revisión muestra el panel de la decisión (aprobar o devolver) y no ofrece crear una versión nueva', async () => {
    const { raiz, servidor } = await montar({ estado: 'IN_REVIEW' });
    const decision = raiz.querySelector<HTMLElement>('[data-accion="decision-caso"]')!;
    expect(decision.querySelector('h2')!.textContent).toContain('Estado y decisión del caso');
    expect(decision.querySelector('app-case-review-panel')).not.toBeNull();
    const botones = [...decision.querySelectorAll('button')].map((b) => b.textContent ?? '').join('|');
    expect(botones).toContain('Aprobar y publicar');
    expect(botones).toContain('Devolver a borrador');
    expect(botones).not.toContain('Crear una versión nueva');
    expect(servidor.metodos).toContain('lifecycle');
  });

  it('publicado dice que está publicado y deja crear una versión nueva, que abre en el editor', async () => {
    const { raiz, servidor, fixture, listo } = await montar({ estado: 'PUBLISHED' });
    expect(raiz.querySelector('[role="status"].listo')!.textContent).toContain('El caso está publicado');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const crear = [...raiz.querySelectorAll<HTMLButtonElement>('[data-accion="decision-caso"] button')].find((b) => b.textContent?.trim() === 'Crear una versión nueva')!;
    expect(crear).toBeDefined();
    crear.click();
    await listo();
    await fixture.whenStable();
    expect(servidor.llamadasA('cloneCaseVersion')).toHaveLength(1);
    expect(navegar).toHaveBeenCalledWith(`/portal/casos/${CASO + 1000}/editor`);
  });

  it('si no se puede crear la versión, lo dice y no se mueve de pantalla', async () => {
    const { raiz, servidor, fixture, listo } = await montar({ estado: 'PUBLISHED' });
    servidor.fallar('cloneCaseVersion', 500);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Crear una versión nueva')!.click();
    await listo();
    await fixture.whenStable();
    await listo();
    expect(raiz.querySelector('.version-nueva .error')!.textContent).toContain('No se pudo crear la versión nueva');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('cuando el panel cambia el estado del caso, la pantalla lo vuelve a leer', async () => {
    const { servidor, store, listo } = await montar({ estado: 'IN_REVIEW' });
    servidor.llamadas.length = 0;
    servidor.editor.status = 'PUBLISHED';
    servidor.editor.revision += 1;
    servidor.cambiosDelCaso.next(CASO);
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(servidor.llamadasA('caseEditor')).toHaveLength(1);
    expect(store.caso()!.estado).toBe('PUBLISHED');
  });

  it('el aviso de otro caso no la hace releer', async () => {
    const { servidor, listo } = await montar({ estado: 'IN_REVIEW' });
    servidor.llamadas.length = 0;
    servidor.cambiosDelCaso.next(CASO + 7);
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(servidor.llamadasA('caseEditor')).toHaveLength(0);
  });
});

describe('RevisionComponent · un caso que Psicología devolvió', () => {
  afterEach(() => document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()));

  it('quien autora lee el motivo y la nota con los que se devolvió el caso a borrador', async () => {
    const { raiz } = await montar({
      revision: { requestedBy: 'Docente', requestedAt: '2026-10-20T10:00:00Z', decision: 'REJECTED', reason: 'FORMA', note: 'Falta contexto en la primera escena.' },
    });
    const tarjeta = raiz.querySelector<HTMLElement>('[data-accion="devuelto-por-psicologia"]')!;
    expect(tarjeta.querySelector('h2')!.textContent).toContain('Psicología devolvió el caso');
    expect(tarjeta.textContent).toContain('Motivo: Forma.');
    expect(tarjeta.textContent).toContain('Nota: Falta contexto en la primera escena.');
  });

  it('un caso que nunca se devolvió no muestra esa tarjeta', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('[data-accion="devuelto-por-psicologia"]')).toBeNull();
  });

  it('una aprobación anterior tampoco la muestra', async () => {
    const { raiz } = await montar({ revision: { requestedBy: 'Docente', requestedAt: '2026-10-20T10:00:00Z', decision: 'APPROVED' } });
    expect(raiz.querySelector('[data-accion="devuelto-por-psicologia"]')).toBeNull();
  });
});
