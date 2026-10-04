/**
 * Textos de la ayuda «Cómo se juega» (F§5.8). Son un contrato de copy: se escriben una sola vez
 * aquí y los revisa Psicología antes de publicar. Funciones puras, sin Angular.
 *
 * Reglas del contenido:
 * - La promesa de salida segura (pausa reanudable, tecla Esc) solo se escribe cuando el anfitrión
 *   confirma que es verdad en todos los estados (`safeExitPromise`); si no, desaparece por completo.
 * - Los números del dock de herramientas NO son atajos: nunca se promete «1 a 5». El único rango
 *   de teclas que se menciona es el de las opciones de un diálogo («1 a 4»).
 * - Nada nombra una técnica clínica ni insinúa cuál decisión es la adecuada: la ayuda solo
 *   orienta proceso y lugar.
 */

import { DECISION_TOTAL, ORIENTATION_COPY } from './orientation.config';

/** Modalidad de puntero con la que se escribe el texto: teclado y ratón, o pantalla táctil. */
export type HelpModality = 'keyboard' | 'touch';

export const HELP_TEXT = {
  /** Título de la tarjeta y de la pantalla permanente; el mismo rótulo que el botón del HUD (una sola fuente). */
  title: ORIENTATION_COPY.ui.helpTitle,
  understood: 'Entendido',
  moreHelp: 'Más ayuda',
  closeHelp: 'Cerrar ayuda',
} as const;

export interface HelpCardOptions {
  modality: HelpModality;
  /** Pantalla baja (menos de 520 px de alto): una sola frase. */
  compact: boolean;
  safeExitPromise: boolean;
}

const WHAT_TO_DO_LINE =
  'La tarjeta «Qué hacer» te dice el siguiente paso y dónde. Nunca marca cuál decisión es la adecuada: eso lo decides tú.';

const KEYBOARD_MOVE_LINE =
  'Muévete con las flechas o WASD. Acércate a una persona o un objeto: abajo aparece su nombre. Pulsa E para actuar.';

/**
 * Líneas de la tarjeta de primera vez. Compacto táctil: la frase corta de F§5.8 (el resto vive
 * en «Más ayuda»); un teclado en una ventana baja conserva solo su primera línea, sin copy nuevo.
 */
export function firstTimeHelpLines(options: HelpCardOptions): readonly string[] {
  const { modality, compact, safeExitPromise } = options;
  if (compact) {
    return modality === 'touch'
      ? ['Mantén pulsada una flecha para caminar. Toca «Interactuar» cuando veas un nombre abajo.']
      : [KEYBOARD_MOVE_LINE];
  }
  const lines: string[] = [];
  lines.push(
    modality === 'touch'
      ? 'Mantén pulsada una flecha para caminar. Cuando algo tenga nombre cerca, toca «Interactuar».'
      : KEYBOARD_MOVE_LINE,
  );
  lines.push(WHAT_TO_DO_LINE);
  if (safeExitPromise) {
    lines.push(
      modality === 'touch'
        ? 'Puedes pausar el caso en cualquier momento con «Salida segura». Tu avance se guarda.'
        : 'Puedes pausar el caso en cualquier momento con «Salida segura» (con teclado, también Esc). Tu avance se guarda.',
    );
  }
  return lines;
}

export type HelpSectionId =
  | 'caso'
  | 'moverte'
  | 'interactuar'
  | 'que-hacer'
  | 'herramientas'
  | 'decidir'
  | 'bitacora'
  | 'salida-segura'
  | 'teclas';

export interface HelpSection {
  id: HelpSectionId;
  title: string;
  text: string;
}

export interface HelpScreenOptions {
  modality: HelpModality;
  safeExitPromise: boolean;
}

/** Secciones de la pantalla permanente «Cómo se juega», en el orden en que se leen. */
export function helpSections(options: HelpScreenOptions): readonly HelpSection[] {
  const { modality, safeExitPromise } = options;
  const touch = modality === 'touch';
  const sections: HelpSection[] = [
    {
      id: 'caso',
      title: 'El caso',
      text:
        `Acompañas una atención psicosocial en dos lugares: el hospital y la Comisaría de Familia. Tomarás ${DECISION_TOTAL} decisiones clínicas, una por etapa. Entre una y otra explorarás las salas, hablarás con las personas y reunirás información.`,
    },
    {
      id: 'moverte',
      title: 'Moverte',
      text: touch ? 'Mantén pulsada una flecha; un toque da un paso corto.' : 'Flechas o WASD.',
    },
    {
      id: 'interactuar',
      title: 'Interactuar',
      text: touch
        ? 'Acércate y toca «Interactuar». El botón dice con qué vas a interactuar.'
        : 'Acércate a una persona o un objeto con nombre y pulsa E (también sirven Espacio y Enter).',
    },
    {
      id: 'que-hacer',
      title: 'Qué hacer',
      text:
        'La tarjeta «Qué hacer» te dice el siguiente paso y dónde, y se marca sola cuando lo haces. Los pasos de «Antes de decidir» son recomendados: puedes decidir sin completarlos, pero tu decisión quedará registrada con información incompleta.',
    },
    {
      id: 'herramientas',
      title: 'Herramientas',
      text:
        'Se recogen explorando las salas y quedan en la barra de abajo. Se usan durante una conversación, cuando aparece la opción de usarlas. Al tocar una herramienta de la barra lees para qué sirve.',
    },
    {
      id: 'decidir',
      title: 'Decidir sin prisa',
      text:
        'No hay límite de tiempo. Ninguna opción está marcada como correcta; recibirás retroalimentación formativa después de decidir. Tu elección queda registrada en tu seguimiento.',
    },
    {
      id: 'bitacora',
      title: 'Bitácora',
      text: touch
        ? 'Escribe tus reflexiones cuando quieras con el botón de la cabecera.'
        : 'Escribe tus reflexiones cuando quieras (tecla J o botón de la cabecera).',
    },
  ];
  if (safeExitPromise) {
    sections.push({
      id: 'salida-segura',
      title: 'Salida segura',
      text: touch
        ? 'Puedes pausar el caso en cualquier momento con el botón «Salida segura». Tu avance se guarda y lo retomas cuando quieras.'
        : 'Puedes pausar el caso en cualquier momento con el botón «Salida segura» (con teclado, también Esc). Tu avance se guarda y lo retomas cuando quieras.',
    });
  }
  if (!touch) {
    const keys = [
      'Mover: flechas o WASD',
      'Interactuar: E, Espacio o Enter',
      'Avanzar un diálogo: Enter o Espacio',
      'Elegir una opción: 1 a 4',
      'Bitácora: J',
    ];
    if (safeExitPromise) keys.push('Salida segura: Esc');
    sections.push({ id: 'teclas', title: 'Teclas', text: keys.join(' · ') });
  }
  return sections;
}
