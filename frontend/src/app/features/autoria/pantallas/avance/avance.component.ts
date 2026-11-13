import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import type { Generation } from '../../../../core/models/generacion.model';
import { GeneracionService } from '../../generacion/generacion.service';
import { rutaDelEditor } from '../../rutas';

type EstadoEtapa = 'hecha' | 'en-curso' | 'error' | 'pendiente';

interface ItemEtapa {
  clave: string;
  texto: string;
  estado: EstadoEtapa;
}

// El estado de cada etapa va en texto y en símbolo, nunca solo en color.
const SIMBOLO: Record<EstadoEtapa, string> = { hecha: '✓', 'en-curso': '…', error: '!', pendiente: '○' };
// BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
const TEXTO_ESTADO: Record<EstadoEtapa, string> = { hecha: 'Hecha', 'en-curso': 'En curso', error: 'Con error', pendiente: 'Pendiente' };

/**
 * La pantalla de avance de la generación (`casos/nuevo/generando/:generacionId`): llama a `continuar(id)` al entrar y
 * `detener()` al salir. Muestra la lista de etapas con su estado, anuncia cada cambio en una región viva y, al llegar a
 * «listo» o «fallo», lleva el foco al título. No navega sola: la docente abre su caso con el botón (P4).
 */
@Component({
  selector: 'app-avance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina avance">
      <h1 #titulo tabindex="-1">{{ tituloPagina() }}</h1>
      <p role="status" class="anuncio">{{ anuncio() }}</p>

      @if (tipoEtapa() === 'listo') {
        <p>Lo marcado «Sugerido por la IA» espera tu revisión.</p>
      } @else if (tipoEtapa() === 'fallo') {
        <p>La IA dejó partes que no cumplen las reglas del documento. Prueba a describir el caso de otra forma.</p>
      }

      <ol class="etapas" aria-label="Etapas de la generación">
        @for (item of items(); track item.clave) {
          <li class="etapa" [attr.data-estado]="item.estado">
            <span class="simbolo" aria-hidden="true">{{ simbolo(item.estado) }}</span>
            <span class="texto">{{ item.texto }}</span>
            <span class="estado">{{ textoEstado(item.estado) }}</span>
          </li>
        }
      </ol>

      @if (error(); as e) {
        <div class="tarjeta aviso-error" role="alert">
          <p>{{ e.mensaje }}</p>
          <div class="acciones">
            @if (e.reintentable) {
              <button type="button" class="boton boton-primario" (click)="reintentar()">Reintentar esta parte</button>
            }
            <button type="button" class="boton" [attr.aria-disabled]="cancelando()" (click)="empezarDeNuevo()">
              Cancelar y empezar de nuevo
            </button>
          </div>
          @if (errorAlCancelar()) {
            <p>{{ errorAlCancelar() }}</p>
          }
        </div>
      }

      @if (tipoEtapa() === 'listo') {
        <div class="acciones">
          <button type="button" class="boton boton-primario" (click)="abrirMiCaso()">Abrir mi caso</button>
        </div>
      } @else if (tipoEtapa() === 'fallo') {
        <div class="acciones">
          <button type="button" class="boton boton-primario" [attr.aria-disabled]="cancelando()" (click)="empezarDeNuevo()">
            Empezar de nuevo
          </button>
        </div>
        @if (errorAlCancelar()) {
          <p class="aviso-error tarjeta" role="alert">{{ errorAlCancelar() }}</p>
        }
      }

      @if (tipoEtapa() !== 'listo' && tipoEtapa() !== 'fallo') {
        <p class="texto-secundario">Puedes cerrar esta página: el avance se guarda y podrás retomarlo.</p>
      }
    </div>
  `,
  styles: `
    .avance { display: flex; flex-direction: column; gap: 16px; }
    .avance h1 { margin: 0; }
    .avance h1:focus { outline: 3px solid var(--primario); outline-offset: 4px; }
    .avance p { margin: 0; }
    .anuncio { min-height: 24px; font-size: var(--autoria-texto-16); }
    .etapas { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .etapa {
      display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 8px 12px;
      border: 2px solid var(--linea); border-radius: var(--radio-control); background: var(--superficie);
    }
    .etapa .simbolo {
      display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex: none;
      border-radius: 999px; border: 2px solid var(--borde-control); font-weight: 700;
    }
    .etapa .texto { flex: 1 1 220px; font-size: var(--autoria-texto-16); line-height: 24px; }
    .etapa .estado { font-size: var(--autoria-texto-16); font-weight: 700; }
    .etapa[data-estado='hecha'] { border-color: var(--adecuada-borde); }
    .etapa[data-estado='hecha'] .simbolo { background: var(--adecuada-tinte); border-color: var(--adecuada-borde); color: var(--adecuada); }
    .etapa[data-estado='en-curso'] { border-color: var(--primario); }
    .etapa[data-estado='error'] { border-color: var(--peligro); background: var(--peligro-tinte); }
    .aviso-error { display: flex; flex-direction: column; gap: 12px; border: 2px solid var(--peligro); background: var(--peligro-tinte); }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
  `,
})
export class AvanceComponent implements OnInit, OnDestroy {
  private readonly generacion = inject(GeneracionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('generacionId') ?? '';
  private readonly titulo = viewChild.required<ElementRef<HTMLElement>>('titulo');

  protected readonly error = this.generacion.error;
  protected readonly cancelando = signal(false);
  protected readonly errorAlCancelar = signal<string | null>(null);

  /** La generación de esta pantalla: lo que el servicio guarda de otra generación (de una visita anterior) no cuenta. */
  private readonly g = computed<Generation | null>(() => {
    const g = this.generacion.generacion();
    return g && g.id === this.id ? g : null;
  });
  private readonly etapa = computed(() => (this.g() ? this.generacion.etapa() : null));
  protected readonly tipoEtapa = computed(() => this.etapa()?.tipo ?? null);

  protected readonly tituloPagina = computed(() => {
    switch (this.tipoEtapa()) {
      // BORRADOR: textos del brief de la Tarea 9, pendientes de la aprobación de Psicología
      case 'listo': return 'Tu caso está listo como borrador';
      case 'fallo': return 'No pudimos armar un caso que se pueda abrir';
      default: return 'Estamos armando tu caso';
    }
  });

  /** Lo que se está haciendo ahora, para la región viva. En «listo», «fallo» o error lo dicen el foco y la alerta. */
  protected readonly anuncio = computed(() => {
    const etapa = this.etapa();
    if (this.error() || !etapa) return '';
    switch (etapa.tipo) {
      case 'esqueleto': return 'Armando el esqueleto';
      case 'escena': return `Escribiendo la escena ${etapa.n} de ${etapa.total}: ${etapa.titulo}`;
      case 'reglas': return 'Revisando las reglas';
      case 'reparando': return `Corrigiendo «${etapa.titulo}» (ronda ${etapa.ronda} de 2)`;
      default: return '';
    }
  });

  protected readonly items = computed<ItemEtapa[]>(() => {
    const g = this.g();
    const etapa = this.etapa();
    const error = this.error();
    const trabajando = this.generacion.trabajando();
    const items: ItemEtapa[] = [];

    const esqueleto: EstadoEtapa = !g ? 'en-curso'
      : g.status !== 'created' ? 'hecha'
      : error?.parte === 'esqueleto' ? 'error'
      : trabajando || etapa?.tipo === 'esqueleto' ? 'en-curso' : 'pendiente';
    items.push({ clave: 'esqueleto', texto: 'Armando el esqueleto', estado: esqueleto });

    const total = g?.scenes.length ?? 0;
    g?.scenes.forEach((s, i) => {
      const escribiendo = trabajando && s.state === 'pending' && etapa?.tipo === 'escena' && etapa.titulo === s.titulo;
      const estado: EstadoEtapa = s.state === 'done' ? 'hecha'
        : s.state === 'error' || (error?.parte === 'escena' && error.clave === s.clave) ? 'error'
        : s.state === 'running' || escribiendo ? 'en-curso' : 'pendiente';
      items.push({
        clave: `escena-${s.clave}`,
        texto: estado === 'en-curso' ? `Escribiendo la escena ${i + 1} de ${total}: ${s.titulo}` : `Escena ${i + 1} de ${total}: ${s.titulo}`,
        estado,
      });
    });

    const reparando = etapa?.tipo === 'reparando' ? etapa : null;
    if (reparando || (g?.status === 'needs_repair' && g.repair)) {
      const titulo = reparando?.titulo ?? g?.scenes.find((s) => s.clave === g.repair?.scenes[0])?.titulo ?? '';
      const ronda = reparando?.ronda ?? g?.repair?.round ?? 1;
      items.push({ clave: 'reparar', texto: `Corrigiendo «${titulo}» (ronda ${ronda} de 2)`, estado: error ? 'error' : 'en-curso' });
    }

    const reglas: EstadoEtapa = g?.status === 'imported' ? 'hecha'
      : g?.status === 'failed' || error?.parte === 'ensamblado' ? 'error'
      : etapa?.tipo === 'reglas' && trabajando ? 'en-curso' : 'pendiente';
    items.push({ clave: 'reglas', texto: 'Revisando las reglas', estado: reglas });
    return items;
  });

  constructor() {
    // Al llegar a «listo» o «fallo» el foco va al título, cuando ya muestra su texto nuevo.
    effect(() => {
      const tipo = this.tipoEtapa();
      if (tipo === 'listo' || tipo === 'fallo') {
        afterNextRender(() => this.titulo().nativeElement.focus(), { injector: this.injector });
      }
    });
  }

  ngOnInit(): void {
    void this.generacion.continuar(this.id);
  }

  ngOnDestroy(): void {
    this.generacion.detener();
  }

  protected simbolo(estado: EstadoEtapa): string {
    return SIMBOLO[estado];
  }

  protected textoEstado(estado: EstadoEtapa): string {
    return TEXTO_ESTADO[estado];
  }

  protected reintentar(): void {
    void this.generacion.reintentar();
  }

  protected abrirMiCaso(): void {
    const id = this.g()?.caseVersionId;
    if (id) void this.router.navigateByUrl(rutaDelEditor('/editor', String(id)));
  }

  /** Cancela esta generación (si ya terminó, el servicio lo da por hecho) y vuelve al paso 2 con el mismo lugar. */
  protected async empezarDeNuevo(): Promise<void> {
    if (this.cancelando()) return;
    const lugarId = this.g()?.lugarId;
    this.cancelando.set(true);
    this.errorAlCancelar.set(null);
    try {
      await this.generacion.cancelar(this.id);
    } catch {
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      this.errorAlCancelar.set('No pudimos cancelar el caso. Vuelve a intentarlo.');
      this.cancelando.set(false);
      return;
    }
    this.cancelando.set(false);
    const destino = lugarId ? `/salas?lugar=${encodeURIComponent(lugarId)}` : '/salas';
    await this.router.navigateByUrl(rutaDelEditor(destino, null));
  }
}
