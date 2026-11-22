import { type Signal, effect, inject, signal } from '@angular/core';

import { CasoStore } from '../../estado/caso.store';
import { PintorDeVistas, type SalaDeBiblioteca } from '../../pantallas/lugar/pintor-de-vistas.service';

/**
 * La imagen de cada sala del caso abierto, venga como venga: el fondo dibujado o, si la sala es por piezas, el cuarto
 * compuesto con el pintor del juego (`PintorDeVistas`, con caché por sesión). Es lo que pintan las tarjetas de Caminos, el
 * Inspector y la vista de cámara de la escena (EDITOR-PRO.md, punto 3: «miniaturas reales»).
 *
 * Patrón: Facade + Observer. Un contenedor la llama una vez y pasa el mapa a sus piezas de presentación (que no conocen el
 * servicio). Mientras una sala se compone, su entrada falta y la pieza pinta su patrón de baldosas.
 *
 * Límite conocido: el pintor guarda una imagen por sala y por sesión; si la docente cambia la estructura en la sala, la
 * miniatura nueva llega al recargar.
 */
export function injectMiniaturasDeSalas(): Signal<ReadonlyMap<string, string | null>> {
  const store = inject(CasoStore);
  const pintor = inject(PintorDeVistas);
  const mapa = signal<ReadonlyMap<string, string | null>>(new Map());
  effect(() => {
    const caso = store.caso();
    if (!caso?.lugarId) return;
    const lugar = caso.lugarId;
    for (const sala of caso.salas) {
      if (mapa().has(sala.id)) continue;
      void pintor.vista(lugar, sala as unknown as SalaDeBiblioteca).then((src) => {
        mapa.update((m) => new Map(m).set(sala.id, src));
      });
    }
  });
  return mapa.asReadonly();
}
