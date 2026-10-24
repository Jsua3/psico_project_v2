import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Pantalla provisional mientras se construye la definitiva (se reemplaza tarea a tarea). */
@Component({
  selector: 'app-pendiente',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="pagina">
      <h1>Esta pantalla está en construcción</h1>
      <p class="texto-secundario">Llega en uno de los próximos pasos del sandbox.</p>
      <a routerLink="/" class="boton">Volver a Mis casos</a>
    </section>
  `,
})
export class PendienteComponent {}
