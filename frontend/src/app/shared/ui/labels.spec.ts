import { objectTypeLabel, plural, roleLabel, statusLabel } from './labels';

/** Plan visual §2.10: una sola tabla de etiquetas; nunca un enum crudo ni una clave técnica en pantalla. */
describe('labels: etiquetas humanas', () => {
  it('traduce los roles a su nombre en español', () => {
    expect(roleLabel('ADMIN')).toBe('Administrador');
    expect(roleLabel('PROFESOR')).toBe('Docente');
    expect(roleLabel('ESTUDIANTE')).toBe('Estudiante');
    expect(roleLabel(undefined)).toBe('Sin rol');
  });

  it('traduce los estados de caso y de intento con los textos que ya ven las personas', () => {
    expect(statusLabel('PUBLISHED')).toBe('Publicado');
    expect(statusLabel('DRAFT')).toBe('Borrador');
    expect(statusLabel('IN_REVIEW')).toBe('En revisión');
    expect(statusLabel('ARCHIVED')).toBe('Archivado');
    expect(statusLabel('COMPLETED')).toBe('Finalizado');
    expect(statusLabel('PAUSED')).toBe('En pausa (reanudable)');
    expect(statusLabel('SAFE_EXITED')).toBe('Cerrado con salida segura');
    expect(statusLabel('REPLACED')).toBe('Reemplazado por un intento nuevo');
    expect(statusLabel('IN_PROGRESS')).toBe('En curso');
    expect(statusLabel('PENDING')).toBe('Pendiente');
    expect(statusLabel('in_progress')).toBe('En curso');
  });

  it('un estado vacío dice «Sin estado» y uno desconocido no se muestra como enum crudo', () => {
    expect(statusLabel(null)).toBe('Sin estado');
    expect(statusLabel('')).toBe('Sin estado');
    expect(statusLabel('WAITING_FOR_REVIEW')).toBe('Waiting for review');
  });

  it('traduce los tipos de objeto del mundo', () => {
    expect(objectTypeLabel('PERSON')).toBe('Persona');
    expect(objectTypeLabel('EXIT')).toBe('Salida');
    expect(objectTypeLabel('TOOL')).toBe('Herramienta');
    expect(objectTypeLabel('TOOL_TARGET')).toBe('Objetivo de herramienta');
    expect(objectTypeLabel('OBJECT')).toBe('Objeto');
  });

  it('plural concuerda con la cantidad', () => {
    expect(plural(1, 'nodo')).toBe('1 nodo');
    expect(plural(2, 'nodo')).toBe('2 nodos');
    expect(plural(0, 'error', 'errores')).toBe('0 errores');
    expect(plural(1, 'advertencia')).toBe('1 advertencia');
  });
});
