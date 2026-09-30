/**
 * Quién tiene el foco decide qué hace una tecla mientras Phaser vive en la página.
 *
 * Phaser ya no captura teclas (ni `preventDefault` ni `stopPropagation`): sigue leyendo flechas,
 * WASD, E, Espacio y Enter de `window`, pero el navegador conserva su comportamiento — escribir
 * en un campo, activar un botón con Enter/Espacio. Estos predicados puros deciden, por cuadro,
 * cuándo ignorar esas teclas del juego. Se calculan sobre `document.activeElement`.
 */

/** Tipos de `<input>` que se activan o se arrastran en vez de recibir texto. */
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color']);
/** Tipos de `<input>` que se activan con Enter/Espacio. */
const ACTIVATABLE_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset']);
/** Roles ARIA con activación propia por teclado. */
const ACTIVATABLE_ROLES = new Set(['button', 'switch', 'checkbox', 'menuitem', 'tab', 'option']);
/** Teclas que el navegador usa para desplazar la página. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);

function inputType(el: Element): string {
  return ((el as HTMLInputElement).type || el.getAttribute('type') || 'text').toLowerCase();
}

/** El foco está donde se escribe: textarea, select, input de texto o elemento editable. */
export function isTextEntryTarget(el: Element | null): boolean {
  if (!el) return false;
  switch (el.tagName) {
    case 'TEXTAREA':
    case 'SELECT':
      return true;
    case 'INPUT':
      return !NON_TEXT_INPUT_TYPES.has(inputType(el));
    default:
      return (el as HTMLElement).isContentEditable === true;
  }
}

/** El foco está en algo que el navegador activa con Enter o Espacio (botón, enlace, interruptor…). */
export function isActivatableTarget(el: Element | null): boolean {
  if (!el) return false;
  switch (el.tagName) {
    case 'BUTTON':
      return true;
    case 'A':
      if (el.hasAttribute('href')) return true;
      break;
    case 'INPUT':
      if (ACTIVATABLE_INPUT_TYPES.has(inputType(el))) return true;
      break;
  }
  const role = el.getAttribute('role');
  return role !== null && ACTIVATABLE_ROLES.has(role);
}

/**
 * Flechas y Espacio sin modificadores desplazarían la página (la «Vista previa» del editor, el
 * lobby). Sin la captura de Phaser, algo tiene que cancelarlos; pero nunca cuando el destino los
 * necesita: un campo de texto (cursor, Espacio) o un control que se activa con teclado.
 */
export function shouldBlockScrollKey(event: KeyboardEvent): boolean {
  if (!SCROLL_KEYS.has(event.key)) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target instanceof Element ? event.target : null;
  return !isTextEntryTarget(target) && !isActivatableTarget(target);
}

/** Lo que Phaser marcó como «recién pulsado» en este cuadro. */
export interface InteractKeys {
  e: boolean;
  space: boolean;
  enter: boolean;
}

/**
 * ¿Esta pulsación cuenta como «interactuar»? Con el foco en un campo de texto nada cuenta (la
 * «e» de una palabra no abre un diálogo); con el foco en un botón, Espacio y Enter los activa el
 * navegador y no deben duplicarse, pero E sigue siendo del juego.
 */
export function resolveInteractPress(focus: Element | null, pressed: InteractKeys): boolean {
  if (isTextEntryTarget(focus)) return false;
  if (isActivatableTarget(focus)) return pressed.e;
  return pressed.e || pressed.space || pressed.enter;
}

/** Lo único que se pide de `NgZone`: correr algo sin disparar la detección de cambios. */
export interface OutsideAngularRunner {
  runOutsideAngular<T>(fn: () => T): T;
}

/**
 * Cancela el desplazamiento de página con flechas y Espacio (ver `shouldBlockScrollKey`) mientras
 * dura el llamador. Va fuera de la zona de Angular: con caminata sostenida son ~30 teclas por
 * segundo y ninguna debe provocar detección de cambios. Devuelve la función que lo retira.
 *
 * Debe armarse DESPUÉS de crear el `Phaser.Game`: Phaser ignora los `keydown` ya cancelados
 * (`event.defaultPrevented`), y en `window` los oyentes corren en orden de registro.
 */
export function attachScrollKeyGuard(zone: OutsideAngularRunner, target: Window = window): () => void {
  const guard = (event: KeyboardEvent): void => {
    if (shouldBlockScrollKey(event)) event.preventDefault();
  };
  zone.runOutsideAngular(() => target.addEventListener('keydown', guard));
  return () => target.removeEventListener('keydown', guard);
}
