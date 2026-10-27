import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { DecisionOptionUpsertRequest, EndingRule, NodeUpsertRequest, WorldRoomSaveRequest } from '../../../core/models/simulation.model';
import type { CasoBorrador, ClaseRespuesta } from '../modelo/caso';
import { casoCopiadoDeLugar, casoSinLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { CasoStore } from './caso.store';

const CASO = 41;

/** El store contra un servidor en memoria. `lugar` es lo que responde la biblioteca. */
function montar(opciones: { sinLugar?: boolean } = {}) {
  TestBed.resetTestingModule();
  const caso = opciones.sinLugar ? casoSinLugar() : casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  const servidor = new ServidorFalso(caso, opciones.sinLugar ? null : universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  return { servidor, store: TestBed.inject(CasoStore) };
}

async function abrir(opciones: { sinLugar?: boolean } = {}) {
  const m = montar(opciones);
  await m.store.cargar(opciones.sinLugar ? 7 : CASO);
  m.servidor.llamadas.length = 0;
  return m;
}

const caso = (store: CasoStore): CasoBorrador => store.caso()!;
const sala = (store: CasoStore, id: string) => caso(store).salas.find((s) => s.id === id)!;
const escenaDe = (store: CasoStore, salaId: string) => caso(store).escenas.find((e) => e.salaId === salaId)!;

describe('CasoStore con la API · abrir un caso', () => {
  it('cargar lee el caso, el mundo de cada mapa y el lugar, y lo deja como borrador', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    expect(servidor.metodos).toEqual(['caseEditor', 'worldEditor', 'worldEditor', 'libraryPlace']);
    expect(caso(store).id).toBe(String(CASO));
    expect(caso(store).revision).toBe(3);
    expect(caso(store).lugarId).toBe('universidad');
    expect(caso(store).salas.map((s) => s.id)).toEqual(['consultorio', 'pasillo']);
    expect(store.cargando()).toBe(false);
    expect(store.errorDeCarga()).toBeNull();
  });

  it('si el caso no se puede leer, lo dice sin dejar un caso a medias', async () => {
    const { servidor, store } = montar();
    servidor.fallar('caseEditor', 404);
    await store.cargar(CASO);
    expect(store.caso()).toBeNull();
    expect(store.errorDeCarga()).toMatch(/no encontramos|no pudimos/i);
  });

  it('un caso sin lugarId abre con salas vacías editables (sin catálogo, pero se pueden mover y guardar)', async () => {
    const { servidor, store } = await abrir({ sinLugar: true });
    expect(caso(store).lugarId).toBeNull();
    expect(caso(store).catalogo).toEqual({ muebles: [], objetos: [], herramientas: [] });
    expect(caso(store).salas.length).toBeGreaterThan(0);

    // Editar una sala: mover el escritorio. Se guarda sobre el mapa, con la revisión vigente.
    const consultorio = caso(store).salas[0];
    const indice = consultorio.muebles.findIndex((m) => m.ref === 'escritorio');
    expect(indice).toBeGreaterThanOrEqual(0);
    store.moverElemento(consultorio.id, 'mueble', indice, 600, 340);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['saveWorld']);
    const guardado = servidor.llamadas[0].args[0] as WorldRoomSaveRequest;
    expect(guardado.revision).toBe(12);
    expect(guardado.objects.find((o) => o.key === 'escritorio')).toMatchObject({ x: 600, y: 340 });
    expect(store.error()).toBeNull();
  });

  // M4: el mapa de la escena nueva dice siempre su sala; si no, al recargar la sala se parte en dos.
  it('una escena nueva en una sala de un caso sin lugar no parte la sala al recargar', async () => {
    const { servidor, store } = await abrir({ sinLugar: true });
    const antes = caso(store).salas.map((s) => s.id);
    const salaId = caso(store).salas[0].id;
    expect(servidor.mundos.get(1)!.map.ambient).toEqual({}); // el mapa hermano no dice su sala

    store.agregarEscena(salaId, caso(store).escenas[0].id);
    await store.sincronizado();
    expect(store.error()).toBeNull();

    const guardado = servidor.llamadasA('saveWorld')[0].args[0] as WorldRoomSaveRequest;
    expect(guardado.map.ambient['salaId']).toBe(salaId);
    expect(guardado.map.ambient).not.toHaveProperty('lugarId'); // el caso no tiene lugar

    await store.cargar(7);
    expect(caso(store).salas.map((s) => s.id)).toEqual(antes);
    expect(caso(store).escenas).toHaveLength(4);
    expect(caso(store).escenas.filter((e) => e.salaId === salaId)).toHaveLength(2);
  });

  it('una escena nueva en una sala de un lugar escribe la sala y el lugar en su mapa', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('consultorio', escenaDe(store, 'consultorio').id);
    await store.sincronizado();
    const guardado = servidor.llamadasA('saveWorld')[0].args[0] as WorldRoomSaveRequest;
    expect(guardado.map.ambient).toMatchObject({ salaId: 'consultorio', lugarId: 'universidad' });
  });

  it('crearCaso manda el lugar y las salas elegidas y devuelve el id del caso nuevo', async () => {
    const { servidor, store } = montar();
    const id = await store.crearCaso('Mi caso', 'universidad', ['consultorio', 'pasillo']);
    expect(id).toBe(CASO);
    expect(servidor.llamadasA('createCase')[0].args[0]).toEqual({ title: 'Mi caso', lugarId: 'universidad', salas: ['consultorio', 'pasillo'] });
  });
});

describe('CasoStore con la API · cada acción llama a su endpoint con la revisión actual', () => {
  it('cada acción del store llama a su endpoint con la revisión actual', async () => {
    const { servidor, store } = await abrir();
    const consultorio = escenaDe(store, 'consultorio');
    const pasillo = escenaDe(store, 'pasillo');

    /** Ejecuta la acción, espera a que el servidor la reciba y comprueba qué rutas llamó y con qué revisión. */
    const probar = async (que: string, accion: () => unknown, esperadas: string[]) => {
      const antes = servidor.editor.revision;
      servidor.llamadas.length = 0;
      await accion();
      await store.sincronizado();
      expect(servidor.metodos, que).toEqual(esperadas);
      const primera = servidor.llamadas.find((l) => l.revision !== undefined);
      if (primera) expect(primera.revision, `${que}: revisión`).toBe(antes);
      const escrituras = servidor.llamadas.filter((l) => !['caseEditor', 'worldEditor', 'libraryPlace'].includes(l.metodo));
      expect(escrituras.every((l) => l.revision !== undefined), `${que}: todas las escrituras llevan revisión`).toBe(true);
      expect(store.conflicto(), `${que}: sin conflicto`).toBeNull();
      expect(store.error(), `${que}: sin error`).toBeNull();
    };

    // Escenas
    let nueva = '';
    await probar('agregar una escena', () => { nueva = store.agregarEscena('consultorio', consultorio.id); }, ['createNode', 'createMap', 'saveWorld']);
    await probar('mover una escena', () => store.moverEscena(nueva, 700, 220), ['updateNode']);
    await probar('cambiar el título', () => store.editarEscena(nueva, { titulo: 'Después de la espera' }), ['updateNode']);
    await probar('marcar como final', () => store.marcarFinal(nueva, true), ['updateNode']);

    // Líneas del guion
    let linea = '';
    await probar('agregar una línea', () => { linea = store.agregarLinea(consultorio.id); }, ['createDialogue', 'worldEditor']);
    await probar('escribir la línea', () => store.editarLinea(consultorio.id, linea, { texto: 'Hola, pasa.' }), ['updateDialogue']);
    await probar('duplicar la línea', () => store.duplicarLinea(consultorio.id, linea), ['updateDialogue']);
    await probar('mover la línea', () => store.moverLinea(consultorio.id, linea, 1), ['updateDialogue']);
    await probar('borrar la línea', () => store.borrarLinea(consultorio.id, linea), ['updateDialogue']);

    // Respuestas: una respuesta sin clase ni destino se queda en el borrador
    let respuesta = '';
    await probar('agregar una respuesta', () => { respuesta = store.agregarRespuesta(consultorio.id); }, []);
    await probar('escribir la respuesta', () => store.editarRespuesta(consultorio.id, respuesta, { texto: 'Cuéntame.' }), []);
    await probar('elegir la clase', () => store.editarRespuesta(consultorio.id, respuesta, { clase: 'RECOMMENDED' }), []);
    await probar('elegir a dónde lleva (ya se puede guardar)', () => store.conectar(respuesta, pasillo.id), ['createDecision']);
    await probar('editar la respuesta', () => store.editarRespuesta(consultorio.id, respuesta, { retroalimentacion: 'Escuchar da seguridad.' }), ['updateDecision']);
    await probar('conectar con otra escena', () => store.conectar(respuesta, nueva), ['updateDecision']);
    await probar('dejarla sin destino', () => store.conectar(respuesta, null), ['deleteDecision']);
    await probar('conectar de nuevo', () => store.conectar(respuesta, pasillo.id), ['createDecision']);
    await probar('una respuesta que abre una escena nueva', () => store.respuestaAEscenaNueva(consultorio.id, respuesta), ['createNode', 'createMap', 'saveWorld', 'updateDecision']);
    await probar('conectar con…, a una escena nueva', () => store.conectarEscena(pasillo.id, 'nueva'), ['createNode', 'createMap', 'saveWorld']);
    await probar('borrar la respuesta', () => store.borrarRespuesta(consultorio.id, respuesta), ['deleteDecision']);

    // Hitos, riesgo y finales
    await probar('agregar un hito', () => store.agregarHito({ clave: 'abrir_la_conversacion', nombre: 'Abrir la conversación', descripcion: '', decisivo: false }), ['updateMilestones']);
    await probar('editar un hito', () => store.editarHito('abrir_la_conversacion', { nombre: 'Abrir la charla' }), ['updateMilestones']);
    await probar('borrar un hito', () => store.borrarHito('abrir_la_conversacion'), ['updateMilestones']);
    await probar('cambiar el nivel de riesgo', () => store.fijarNivelRiesgo(caso(store).nivelRiesgo === 'SEVERE' ? 'EXTREME' : 'SEVERE'), ['updateRisk']);
    await probar('finales propios (sin ninguno escrito aún no hay nada que guardar)', () => store.fijarModoFinales('propio'), []);
    let final = '';
    await probar('agregar un final', () => { final = store.agregarFinal(); }, ['updateEndings']);
    await probar('editar un final', () => store.editarFinal(final, { texto: 'La persona se siente escuchada.' }), ['updateEndings']);
    let otro = '';
    await probar('agregar otro final', () => { otro = store.agregarFinal(); }, ['updateEndings']);
    await probar('mover un final', () => store.moverFinal(otro, -1), ['updateEndings']);
    await probar('borrar el otro final', () => store.borrarFinal(otro), ['updateEndings']);
    await probar('borrar un final', () => store.borrarFinal(final), ['updateEndings']);

    // Sala: se guarda en todos los mapas de la sala (el consultorio ya tiene dos escenas)
    const salaConsultorio = sala(store, 'consultorio');
    const enCadaMapa = (extra: string[] = []) => [...extra, ...caso(store).escenas.filter((e) => e.salaId === 'consultorio').map(() => 'saveWorld')];
    await probar('mover un mueble', () => store.moverElemento('consultorio', 'mueble', 0, 520, 360), enCadaMapa());
    await probar('voltear un mueble', () => store.voltearMueble('consultorio', 0), enCadaMapa());
    await probar('agregar un mueble', () => store.agregarElemento('consultorio', 'mueble', 'sofa'), enCadaMapa());
    await probar('agregar un objeto', () => store.agregarElemento('consultorio', 'objeto', 'mochila'), enCadaMapa());
    await probar('cambiar a un personaje', () => store.editarPersonajeEnSala('consultorio', 0, { expresion: 'triste' }), enCadaMapa());
    await probar('quitar algo de la sala', () => store.quitarElemento('consultorio', 'objeto', salaConsultorio.objetos.length), enCadaMapa());
    await probar('deshacer en la sala', () => store.deshacer(), enCadaMapa());
    await probar('rehacer en la sala', () => store.rehacer(), enCadaMapa());
    await probar('volver a la sala original', () => store.volverSalaOriginal('consultorio'), enCadaMapa(['libraryPlace']));

    // Borrar
    await probar('borrar una escena', () => store.borrarEscena(nueva), ['deleteNode']);
  });

  it('dos acciones seguidas van en orden, cada una con la revisión que devolvió la anterior', async () => {
    const { servidor, store } = await abrir();
    const inicio = escenaDe(store, 'consultorio');
    store.moverEscena(inicio.id, 10, 10);
    store.moverEscena(escenaDe(store, 'pasillo').id, 20, 20);
    store.marcarFinal(inicio.id, true);
    await store.sincronizado();
    expect(servidor.llamadas.map((l) => l.metodo)).toEqual(['updateNode', 'updateNode', 'updateNode']);
    expect(servidor.llamadas.map((l) => l.revision)).toEqual([3, 4, 5]);
    expect(store.conflicto()).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('el borrador se ve cambiado al instante, antes de que el servidor responda', async () => {
    const { store } = await abrir();
    const id = escenaDe(store, 'consultorio').id;
    store.editarEscena(id, { titulo: 'Recibir a Camila' });
    expect(caso(store).escenas.find((e) => e.id === id)!.titulo).toBe('Recibir a Camila');
    expect(store.guardando()).toBe(true);
    await store.sincronizado();
    expect(store.guardando()).toBe(false);
  });
});

describe('CasoStore con la API · ordenar el mapa', () => {
  it('ordenar el mapa guarda la posición de las escenas que se movieron', async () => {
    const { servidor, store } = await abrir();
    store.moverEscena(escenaDe(store, 'pasillo').id, 900, 700);
    await store.sincronizado();
    servidor.llamadas.length = 0;
    store.ordenarAutomaticamente();
    await store.sincronizado();
    expect(servidor.metodos.length).toBeGreaterThan(0);
    expect(servidor.metodos.every((m) => m === 'updateNode')).toBe(true);
    for (const e of caso(store).escenas) {
      const nodo = servidor.editor.nodes.find((n) => String(n.id) === e.id)!;
      expect([nodo.positionX, nodo.positionY]).toEqual([e.posicion.x, e.posicion.y]);
    }
  });
});

describe('CasoStore con la API · conflicto de revisión', () => {
  it('conflicto de revisión: conserva el borrador, lo expone y recargar relee el caso sin perder lo escrito', async () => {
    const { servidor, store } = await abrir();
    const id = escenaDe(store, 'consultorio').id;
    servidor.otraSesionEscribe(); // otra persona guardó entre medias

    store.editarEscena(id, { titulo: 'Mi título nuevo' });
    await store.sincronizado();

    // 409: no se revierte ni se descarta lo escrito
    expect(store.conflicto()).not.toBeNull();
    expect(caso(store).escenas.find((e) => e.id === id)!.titulo).toBe('Mi título nuevo');
    expect(store.error()).toBeNull();
    expect(servidor.metodos).toEqual(['updateNode']);

    // Mientras haya conflicto no se manda nada más
    store.moverEscena(id, 5, 5);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateNode']);
    expect(caso(store).escenas.find((e) => e.id === id)!.posicion).toEqual({ x: 5, y: 5 });

    // Recargar relee del servidor y deja a la vista lo que no se guardó
    await store.recargar();
    expect(servidor.metodos).toContain('caseEditor');
    expect(store.conflicto()).toBeNull();
    expect(caso(store).revision).toBe(servidor.editor.revision);
    expect(caso(store).escenas.find((e) => e.id === id)!.titulo).not.toBe('Mi título nuevo');
    expect(store.recuperado().join(' ')).toContain('Mi título nuevo');

    // Y se puede seguir editando con la revisión nueva
    servidor.llamadas.length = 0;
    store.editarEscena(id, { titulo: 'Otra vez' });
    await store.sincronizado();
    expect(servidor.llamadas[0].revision).toBe(servidor.editor.revision - 1);
    expect(store.conflicto()).toBeNull();
  });
});

describe('CasoStore con la API · si el servidor rechaza un cambio', () => {
  it('una mutación que falla con 500 se revierte sola, sin tocar las demás', async () => {
    const { servidor, store } = await abrir();
    const a = escenaDe(store, 'consultorio').id;
    const b = escenaDe(store, 'pasillo').id;
    const tituloB = caso(store).escenas.find((e) => e.id === b)!.titulo;
    servidor.fallar('updateNode', 500);

    store.editarEscena(a, { titulo: 'Esto no se guarda' });
    store.moverEscena(b, 333, 111);
    await store.sincronizado();

    const escenas = caso(store).escenas;
    expect(escenas.find((e) => e.id === a)!.titulo).not.toBe('Esto no se guarda'); // revertida
    expect(escenas.find((e) => e.id === b)!.posicion).toEqual({ x: 333, y: 111 }); // la otra sigue
    expect(escenas.find((e) => e.id === b)!.titulo).toBe(tituloB);
    expect(store.error()).toMatch(/no se pudo guardar/i);
    expect(store.conflicto()).toBeNull();
    expect(servidor.metodos).toEqual(['updateNode', 'updateNode']);
    expect(servidor.editor.nodes.find((n) => Number(n.id) === Number(b))!.positionX).toBe(333);
  });

  it('una escena nueva que el servidor rechaza desaparece del borrador y no deja nada a medias', async () => {
    const { servidor, store } = await abrir();
    const antes = caso(store).escenas.length;
    servidor.fallar('createMap', 400, 'No se pudo crear el mapa.');
    const id = store.agregarEscena('consultorio');
    expect(caso(store).escenas).toHaveLength(antes + 1);
    await store.sincronizado();
    expect(caso(store).escenas).toHaveLength(antes);
    expect(caso(store).escenas.some((e) => e.id === id)).toBe(false);
    expect(servidor.metodos).toEqual(['createNode', 'createMap', 'deleteNode']); // deshizo el nodo que alcanzó a crear
    expect(servidor.editor.nodes).toHaveLength(antes);
    expect(store.error()).toContain('Revisa lo que escribiste'); // un 400 no cita el texto del backend
  });
});

describe('CasoStore con la API · el guion', () => {
  it('el guion guarda la clase de 4 valores y los efectos', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const destino = escenaDe(store, 'pasillo');
    const clases: ClaseRespuesta[] = ['RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED'];
    for (const clase of clases) {
      const id = store.agregarRespuesta(origen.id);
      store.editarRespuesta(origen.id, id, {
        texto: `Respuesta ${clase}`, clase, razon: clase === 'CONTRAINDICATED' ? 'Apura a la persona.' : '',
        retroalimentacion: 'Porque sí.', destinoId: destino.id,
        efectos: { persona: { bond: 1, activation: -1 }, hitos: ['valorar_el_riesgo'], competencias: ['ESCUCHA'] },
      });
    }
    await store.sincronizado();

    const cuerpos = servidor.llamadasA('createDecision').map((l) => l.args[0] as DecisionOptionUpsertRequest);
    expect(cuerpos.map((c) => c.responseClass)).toEqual(clases);
    for (const c of cuerpos) {
      expect(c.effects).toEqual({ persona: { bond: 1, activation: -1 }, milestones: ['valorar_el_riesgo'], competencies: ['ESCUCHA'] });
      expect(c.sourceNodeId).toBe(Number(origen.id));
      expect(c.targetNodeId).toBe(Number(destino.id));
    }
    expect(cuerpos[3]).toMatchObject({ prohibitedConduct: true, prohibitionReason: 'Apura a la persona.' });
    expect(cuerpos[0]).toMatchObject({ prohibitedConduct: false, prohibitionReason: null });
    expect(new Set(cuerpos.map((c) => c.optionKey)).size).toBe(4); // cada opción con su clave
    expect(servidor.editor.decisions.map((d) => d.responseClass)).toEqual(clases);
  });

  it('una respuesta sin clase queda en el borrador, no llama al servidor y dice qué falta', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Cuéntame más.', destinoId: escenaDe(store, 'pasillo').id });
    await store.sincronizado();

    expect(servidor.metodos).toEqual([]);
    expect(servidor.editor.decisions).toHaveLength(0);
    expect(caso(store).escenas.find((e) => e.id === origen.id)!.respuestas.find((r) => r.id === id)!.clase).toBeNull(); // nunca una clase por defecto
    expect(store.sinGuardar()).toEqual([expect.objectContaining({ respuestaId: id, mensaje: 'Elige cómo es esta respuesta para guardarla.' })]);

    store.editarRespuesta(origen.id, id, { clase: 'ACCEPTABLE' });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['createDecision']);
    expect(store.sinGuardar()).toEqual([]);
  });

  it('una contraindicada sin razón espera a que se escriba', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Apúrate.', clase: 'CONTRAINDICATED', destinoId: escenaDe(store, 'pasillo').id });
    await store.sincronizado();
    expect(servidor.metodos).toEqual([]);
    expect(store.sinGuardar()[0].mensaje).toBe('Escribe por qué es contraindicada para guardarla.');
    store.editarRespuesta(origen.id, id, { razon: 'Apura a la persona.' });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['createDecision']);
  });

  it('borrar una escena borra antes las respuestas de otras escenas que llegaban a ella', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const destino = escenaDe(store, 'pasillo');
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Vamos.', clase: 'ACCEPTABLE', destinoId: destino.id });
    await store.sincronizado();
    servidor.llamadas.length = 0;

    store.borrarEscena(destino.id);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['deleteDecision', 'deleteNode']);
    expect(store.error()).toBeNull();
    // la respuesta sigue en el borrador, sin destino, para que el docente la vuelva a conectar
    expect(caso(store).escenas.find((e) => e.id === origen.id)!.respuestas.find((r) => r.id === id)!.destinoId).toBeNull();
  });

  it('el guion de una escena con líneas lleva el nombre del personaje, la expresión y la marca de la IA', async () => {
    const { servidor, store } = await abrir();
    const escena = escenaDe(store, 'consultorio');
    const id = store.agregarLinea(escena.id);
    store.editarLinea(escena.id, id, { texto: 'Pasa, por favor.', expresion: 'alegre' });
    await store.sincronizado();
    const cuerpo = servidor.llamadasA('createDialogue')[0].args[1] as { lines: Array<{ speakerName: string; text: string; emotion: string; aiSuggested: boolean }> };
    expect(cuerpo.lines).toEqual([{ displayOrder: 1, speakerName: expect.any(String), text: '', emotion: 'neutral', aiSuggested: false }]);
    expect(servidor.llamadasA('updateDialogue')[0].args[1]).toMatchObject({ lines: [{ text: 'Pasa, por favor.', emotion: 'alegre' }] });
  });
});

describe('CasoStore con la API · finales por hitos', () => {
  it('finales por hitos en modo automático y propio', async () => {
    const { servidor, store } = await abrir();
    const decisivo = caso(store).hitos.find((h) => h.decisivo)!;
    expect(caso(store).modoFinales).toBe('automatico');

    // Automático: sin finales propios (valen los cuatro del modelo)
    store.fijarModoFinales('automatico');
    await store.sincronizado();
    expect(servidor.llamadasA('updateEndings')).toHaveLength(0); // ya lo estaba: no hay nada que decir

    // Propio: el final nuevo se pide por el primer hito decisivo
    store.fijarModoFinales('propio');
    const id = store.agregarFinal();
    await store.sincronizado();
    const finales = servidor.llamadasA('updateEndings').at(-1)!.args[0] as EndingRule[];
    expect(finales).toHaveLength(1);
    expect(finales[0].when).toEqual({ milestone: decisivo.clave });
    expect(finales[0]).toMatchObject({ aiSuggested: false });
    expect(caso(store).finales[0].id).toBe(id);

    // Volver a automático borra los propios en el servidor
    store.fijarModoFinales('automatico');
    await store.sincronizado();
    expect(servidor.llamadasA('updateEndings').at(-1)!.args[0]).toEqual([]);
    expect(servidor.editor.rules.endings).toEqual([]);
  });
});

describe('CasoStore con la API · salas compartidas', () => {
  it('una escena nueva en una sala que existe lleva la sala copiada, y editar la sala la guarda en todos sus mapas', async () => {
    const { servidor, store } = await abrir();
    const antes = escenaDe(store, 'consultorio');
    const id = store.agregarEscena('consultorio', antes.id);
    await store.sincronizado();

    // El mapa nuevo nace con el ambiente de la sala y sus objetos (con ids nuevos)
    const mapaNuevo = servidor.mundos.get(Number(servidor.editor.nodes.at(-1)!.id))!;
    const hermano = servidor.mundos.get(Number(antes.id))!;
    expect(mapaNuevo.map.ambient).toEqual(hermano.map.ambient);
    expect(mapaNuevo.objects.map((o) => o.key)).toEqual(hermano.objects.map((o) => o.key));
    expect(mapaNuevo.objects.every((o) => o.id !== 0)).toBe(true);
    expect(caso(store).salas.filter((s) => s.id === 'consultorio')).toHaveLength(1); // sigue siendo UNA sala

    // Mover algo en la sala se guarda en los dos mapas
    servidor.llamadas.length = 0;
    store.moverElemento('consultorio', 'mueble', 0, 450, 350);
    await store.sincronizado();
    const guardados = servidor.llamadasA('saveWorld');
    expect(guardados).toHaveLength(2);
    expect(guardados.map((g) => g.args[1])).toEqual([Number(antes.id), Number(servidor.editor.nodes.at(-1)!.id)]);
    for (const g of guardados) {
      const cuerpo = g.args[0] as WorldRoomSaveRequest;
      expect(cuerpo.objects.find((o) => o.key === sala(store, 'consultorio').muebles[0].clave)).toMatchObject({ x: 450, y: 350 });
    }
    expect(id).toBeTruthy();
  });

  it('un mueble agregado a una sala compartida recibe la misma clave en todos sus mapas', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('consultorio');
    await store.sincronizado();
    store.agregarElemento('consultorio', 'mueble', 'sofa');
    await store.sincronizado();
    const clave = sala(store, 'consultorio').muebles.at(-1)!.clave!;
    expect(clave).toBeTruthy();
    for (const g of servidor.llamadasA('saveWorld').slice(-2)) {
      const nuevos = (g.args[0] as WorldRoomSaveRequest).objects.filter((o) => o.key === clave);
      expect(nuevos).toHaveLength(1);
    }
    // Guardar otra vez no lo duplica
    store.moverElemento('consultorio', 'mueble', sala(store, 'consultorio').muebles.length - 1, 300, 300);
    await store.sincronizado();
    for (const m of servidor.mundos.values()) {
      if (m.map.ambient['salaId'] === 'consultorio') expect(m.objects.filter((o) => o.key === clave)).toHaveLength(1);
    }
  });

  it('deshacer y rehacer valen para la sala y se guardan', async () => {
    const { servidor, store } = await abrir();
    expect(store.puedeDeshacer()).toBe(false);
    const x0 = sala(store, 'consultorio').personajes[0].x;
    store.moverElemento('consultorio', 'personaje', 0, x0 + 40, 300);
    expect(store.puedeDeshacer()).toBe(true);
    await store.sincronizado();
    store.deshacer();
    expect(sala(store, 'consultorio').personajes[0].x).toBe(x0);
    expect(store.puedeRehacer()).toBe(true);
    await store.sincronizado();
    const ultimo = servidor.llamadasA('saveWorld').at(-1)!.args[0] as WorldRoomSaveRequest;
    expect(ultimo.objects.find((o) => o.type === 'PERSON')!.x).toBe(x0);
  });

  it('volver a la sala original relee la biblioteca y la guarda', async () => {
    const { servidor, store } = await abrir();
    store.quitarElemento('consultorio', 'mueble', 0);
    await store.sincronizado();
    servidor.llamadas.length = 0;
    await store.volverSalaOriginal('consultorio');
    await store.sincronizado();
    expect(servidor.metodos).toContain('saveWorld');
    const original = universidad.salas.find((s) => s.id === 'consultorio')!;
    expect(sala(store, 'consultorio').muebles.map((m) => m.ref)).toEqual(original.muebles.map((m) => m.ref));
  });

  it('el borrador de una escena no pasa a otra visita: cerrar deja el store vacío', async () => {
    const { store } = await abrir();
    store.cerrar();
    expect(store.caso()).toBeNull();
  });
});

describe('CasoStore con la API · lo que propuso la IA', () => {
  it('aceptar una escena, una respuesta o un final baja la marca en el servidor', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const destino = escenaDe(store, 'pasillo');
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Sí.', clase: 'ACCEPTABLE', destinoId: destino.id, marcaIa: true });
    await store.sincronizado();
    servidor.llamadas.length = 0;

    store.aceptarIa({ escenaId: origen.id, respuestaId: id });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['acceptAiDecision']);

    store.fijarModoFinales('propio');
    const final = store.agregarFinal();
    store.editarFinal(final, { marcaIa: true });
    await store.sincronizado();
    servidor.llamadas.length = 0;
    store.aceptarIa({ finalId: final });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateEndings']);
    expect((servidor.llamadas[0].args[0] as EndingRule[])[0].aiSuggested).toBe(false);
  });
});

describe('CasoStore con la API · lo que cambia un servidor distinto al de siempre', () => {
  it('el cuerpo de la escena que se crea lleva su clave, el título y si es la de inicio', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('pasillo');
    await store.sincronizado();
    const cuerpo = servidor.llamadasA('createNode')[0].args[0] as NodeUpsertRequest;
    expect(cuerpo).toMatchObject({ nodeKey: 'escena-1', startNode: false, terminal: false, intensity: 'MEDIUM' });
    expect(cuerpo.title).toContain('Escena nueva');
  });
});
