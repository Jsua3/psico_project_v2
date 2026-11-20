import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Fondo de objetos del simulador al estilo de los «doodles» de WhatsApp: un mosaico de dibujos de línea (cuadernos,
 * fichas, cartelera, camilla, timbre, Ψ…) que se repite sin costuras, quieto detrás del contenido mientras este se
 * desplaza. El mosaico es una MÁSCARA sobre un color sólido: el tono lo pone la piel (claro u oscuro), sin colores en
 * el SVG. Solo aparece entre el inicio de `desde` y el final de `hasta`, con bordes difuminados; por encima del video
 * desenfocado de «Cómo funciona» y por debajo de las tarjetas. Con el cursor, una segunda capa recortada por un círculo
 * que lo sigue ilumina los dibujos cercanos con el violeta de marca. Decorativo (aria-hidden).
 */
@Component({
  selector: 'app-doodles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<div class="capa"></div><div class="foco"></div>`,
  styles: `
    :host {
      --mosaico: url('/assets/landing/doodles/mosaico.svg');
      --a: -9999px;
      --b: -9999px;
      --mx: -9999px;
      --my: -9999px;

      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }

    .capa,
    .foco {
      position: absolute;
      inset: 0;
      -webkit-mask-image: var(--mosaico), linear-gradient(to bottom, transparent var(--a), #000 calc(var(--a) + 180px), #000 calc(var(--b) - 180px), transparent var(--b));
      mask-image: var(--mosaico), linear-gradient(to bottom, transparent var(--a), #000 calc(var(--a) + 180px), #000 calc(var(--b) - 180px), transparent var(--b));
      -webkit-mask-size: 520px 520px, 100% 100%;
      mask-size: 520px 520px, 100% 100%;
      -webkit-mask-repeat: repeat, no-repeat;
      mask-repeat: repeat, no-repeat;
      -webkit-mask-composite: source-in;
      mask-composite: intersect;
    }

    /* El tono de WhatsApp: apenas más claro (u oscuro) que el fondo. */
    .capa {
      background-color: color-mix(in oklab, var(--ds-text-1) 9%, transparent);
    }

    :host-context([data-skin='portal']) .capa {
      background-color: color-mix(in oklab, var(--ds-text-1) 8%, transparent);
    }

    .foco {
      -webkit-mask-image: var(--mosaico), linear-gradient(to bottom, transparent var(--a), #000 calc(var(--a) + 180px), #000 calc(var(--b) - 180px), transparent var(--b)), radial-gradient(circle 200px at var(--mx) var(--my), #000, transparent 72%);
      mask-image: var(--mosaico), linear-gradient(to bottom, transparent var(--a), #000 calc(var(--a) + 180px), #000 calc(var(--b) - 180px), transparent var(--b)), radial-gradient(circle 200px at var(--mx) var(--my), #000, transparent 72%);
      -webkit-mask-size: 520px 520px, 100% 100%, 100% 100%;
      mask-size: 520px 520px, 100% 100%, 100% 100%;
      -webkit-mask-repeat: repeat, no-repeat, no-repeat;
      mask-repeat: repeat, no-repeat, no-repeat;
      -webkit-mask-composite: source-in, source-in;
      mask-composite: intersect, intersect;
      background-color: color-mix(in oklab, var(--l-acento-tinta, var(--ds-primary)) 70%, transparent);
      opacity: 0;
      transition: opacity var(--ds-dur-slow, 300ms) ease;
    }

    :host(.con-cursor) .foco {
      opacity: 1;
    }

    @media (forced-colors: active) {
      :host { display: none; }
    }
  `,
})
export class DoodlesComponent {
  readonly desde = input('#casos');
  readonly hasta = input('#como-funciona');

  constructor() {
    const destroyRef = inject(DestroyRef);
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (typeof matchMedia !== 'function' || typeof requestAnimationFrame !== 'function') return;
      let pedido = 0;
      // La zona visible (en px de la vista) se pasa a la máscara como --a y --b, una vez por cuadro.
      const zona = () => {
        pedido = 0;
        const a = document.querySelector(this.desde());
        const b = document.querySelector(this.hasta());
        if (!a || !b) return;
        host.style.setProperty('--a', `${Math.round(a.getBoundingClientRect().top)}px`);
        host.style.setProperty('--b', `${Math.round(b.getBoundingClientRect().bottom)}px`);
      };
      const pedir = () => { if (!pedido) pedido = requestAnimationFrame(zona); };
      const fino = matchMedia('(hover: hover) and (pointer: fine)');
      const alMover = (ev: PointerEvent) => {
        if (!fino.matches || ev.pointerType !== 'mouse') return;
        host.style.setProperty('--mx', `${ev.clientX}px`);
        host.style.setProperty('--my', `${ev.clientY}px`);
        host.classList.add('con-cursor');
      };
      const alSalir = () => host.classList.remove('con-cursor');

      addEventListener('scroll', pedir, { passive: true });
      addEventListener('resize', pedir);
      addEventListener('pointermove', alMover, { passive: true });
      document.documentElement.addEventListener('pointerleave', alSalir);
      pedir();
      destroyRef.onDestroy(() => {
        if (pedido) cancelAnimationFrame(pedido);
        removeEventListener('scroll', pedir);
        removeEventListener('resize', pedir);
        removeEventListener('pointermove', alMover);
        document.documentElement.removeEventListener('pointerleave', alSalir);
      });
    });
  }
}
