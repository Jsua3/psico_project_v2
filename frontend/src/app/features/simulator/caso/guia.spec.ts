import { armarGuia, opcionesNuevas } from './guia';

const LUGARES = [
  { key: 'puerta-sala', label: 'Sala de escucha', kind: 'door' },
  { key: 'carpeta', label: 'Historia clínica', kind: 'object' },
  { key: 'npc:enfermera', label: 'Enfermera', kind: 'person' },
  { key: 'familia', label: 'Familia', kind: 'person', note: 'persona a atender' },
  { key: 'carpeta', label: 'Historia clínica', kind: 'object' },
] as const;

it('lista personas y objetos con su marca de visto, sin puertas ni repetidos', () => {
  const guia = armarGuia({ goal: '  Contener a la familia ', lugares: LUGARES, inspeccionados: ['carpeta'], hablados: new Set(['enfermera']) });
  expect(guia.objetivo).toBe('Contener a la familia');
  expect(guia.enEstaSala).toEqual([
    { key: 'npc:enfermera', label: 'Enfermera', tipo: 'persona', visto: true },
    { key: 'familia', label: 'Familia', tipo: 'persona', visto: false },
    { key: 'carpeta', label: 'Historia clínica', tipo: 'objeto', visto: true },
  ]);
  expect(guia.quedaPorConocer).toBe(true);
});

it('un objeto sin revisar no se nombra, pero deja algo por conocer', () => {
  const guia = armarGuia({ goal: '', lugares: LUGARES, inspeccionados: ['familia'], hablados: new Set(['enfermera']) });
  expect(guia.enEstaSala.map(e => e.key)).toEqual(['npc:enfermera', 'familia']);
  expect(guia.quedaPorConocer).toBe(true);
});

it('una persona del mapa cuenta como vista si se habló con ella o si se inspeccionó', () => {
  expect(armarGuia({ goal: '', lugares: LUGARES, inspeccionados: ['carpeta', 'familia'], hablados: new Set(['enfermera']) }).quedaPorConocer).toBe(false);
  expect(armarGuia({ goal: '', lugares: LUGARES, inspeccionados: ['carpeta'], hablados: new Set(['enfermera', 'familia']) }).quedaPorConocer).toBe(false);
});

it('sin nada en la sala no queda nada por conocer', () => {
  expect(armarGuia({ goal: '', lugares: [], inspeccionados: [], hablados: new Set() })).toEqual({ objetivo: '', enEstaSala: [], quedaPorConocer: false });
});

it('descarta los rótulos vacíos y conserva el orden dado: personas primero, luego objetos', () => {
  const guia = armarGuia({
    goal: '',
    lugares: [
      { key: 'o1', label: 'Mesa', kind: 'object' },
      { key: 'p1', label: '  ', kind: 'person' },
      { key: 'p2', label: 'Madre', kind: 'person' },
      { key: 'p3', label: 'Padre', kind: 'person' },
      { key: 'o2', label: 'Foto', kind: 'object' },
    ],
    inspeccionados: ['o1', 'o2'],
    hablados: new Set(),
  });
  expect(guia.enEstaSala.map(e => e.key)).toEqual(['p2', 'p3', 'o1', 'o2']);
});

it('las opciones nuevas son las que no estaban antes; en la primera carga ninguna lo es', () => {
  expect(opcionesNuevas([1, 2], [1, 2, 3])).toEqual([3]);
  expect(opcionesNuevas([1, 2], [2])).toEqual([]);
  expect(opcionesNuevas(null, [1, 2])).toEqual([]);
});
