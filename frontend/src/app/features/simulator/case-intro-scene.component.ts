import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { AvatarStore } from '../character/avatar.store';
import { toAvatarV2 } from '../character/kit/avatar-v2';
import { resolveCharacter } from '../character/kit/character-visual.resolver';
import { sheetSourceUrl } from '../character/kit/kit-raster';
import { KitService } from '../character/kit/kit.service';
import { INTRO_STAGE_HEIGHT, INTRO_STAGE_WIDTH, frameAt, introActor, stageLayout } from './intro-scene.util';

/** Parte del alto de la ventana que puede ocupar el escenario: en 1366×768 cabe a 2×. */
const STAGE_HEIGHT_SHARE = 0.58;
/** Centro de las dos lámparas del techo, en px del escenario. */
const LAMP_CENTERS = [150, 234] as const;

/**
 * Escena de la intro: el personaje del estudiante entra de noche a urgencias.
 * Todo es DOM/CSS a resolución nativa (384×216) escalado por enteros. El paso
 * de cuadros corre fuera de Angular y solo escribe dos variables CSS.
 */
@Component({
  selector: 'app-case-intro-scene',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #viewport class="intro-scene">
      <div class="intro-scene__frame" [style.width.px]="layout().frameWidth" [style.height.px]="layout().frameHeight">
        <div class="intro-stage" role="img"
          aria-label="Tu personaje entra de noche al servicio de urgencias del hospital."
          [style.left.px]="layout().offsetX"
          [style.transform]="'scale(' + layout().scale + ')'">
          <div class="intro-stage__wall"></div>
          <div class="intro-stage__window"><span class="intro-stage__moon"></span></div>
          <div class="intro-stage__floor"></div>
          @for (x of lamps; track x) {
            <span class="intro-stage__pool" [style.left.px]="x - 44"></span>
          }
          <img class="intro-stage__door" src="/assets/game/doors/door_urgencias.png" alt="" width="54" height="59">
          <img class="intro-stage__chair" src="/assets/game/furniture/chair.png" alt="" width="22" height="34">
          <img class="intro-stage__plant" src="/assets/game/furniture/plant.png" alt="" width="36" height="47">
          @for (x of lamps; track x) {
            <span class="intro-stage__lamp" [style.left.px]="x - 9"><span class="intro-stage__cone"></span></span>
          }
          <div #actorEl class="intro-actor"
            [class.intro-actor--walking]="phase() === 'walk'"
            (animationend)="onWalkEnd($event)">
            <span class="intro-actor__layer" [style.background-image]="layerUrl()" [style.background-size]="layerSize()"></span>
          </div>
        </div>
        <p class="intro-scene__caption" aria-hidden="true">Hospital · Urgencias · Noche</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .intro-scene { width: 100%; display: flex; justify-content: center; overflow: hidden; }
    .intro-scene__frame {
      position: relative;
      flex: none;
      overflow: hidden;
      border: 1px solid rgba(182,156,255,.24);
      border-radius: 12px;
      background: #1b1731;
    }
    .intro-stage {
      position: absolute;
      top: 0;
      width: 384px;
      height: 216px;
      transform-origin: 0 0;
      image-rendering: pixelated;
    }
    .intro-stage > * { position: absolute; }
    .intro-stage__wall {
      inset: 0 0 88px 0;
      background: repeating-linear-gradient(90deg, #2b2547 0 31px, #241f3d 31px 32px);
      box-shadow: inset 0 6px 0 #1d1934, inset 0 -4px 0 #1a1630;
    }
    .intro-stage__window {
      left: 28px;
      top: 30px;
      width: 64px;
      height: 44px;
      background: linear-gradient(#0b1533, #1a2a55);
      box-shadow: 0 0 0 2px #4b4378;
    }
    .intro-stage__window::after {
      content: '';
      position: absolute;
      left: 31px;
      top: 0;
      width: 2px;
      height: 100%;
      background: #4b4378;
    }
    .intro-stage__moon {
      position: absolute;
      left: 12px;
      top: 8px;
      width: 6px;
      height: 6px;
      background: #e8e4c9;
      box-shadow: 30px 4px 0 -2px #cfd6ff, 42px 16px 0 -2px #cfd6ff;
    }
    .intro-stage__floor {
      left: 0;
      right: 0;
      bottom: 0;
      height: 88px;
      background:
        repeating-linear-gradient(90deg, transparent 0 23px, rgba(0,0,0,.2) 23px 24px),
        repeating-linear-gradient(180deg, #3a3462 0 11px, #332d58 11px 12px);
    }
    .intro-stage__pool {
      top: 142px;
      width: 88px;
      height: 18px;
      border-radius: 50%;
      background: radial-gradient(closest-side, rgba(255,236,170,.16), transparent);
    }
    .intro-stage__door { left: 297px; top: 69px; }
    .intro-stage__chair { left: 106px; top: 104px; }
    .intro-stage__plant { left: 257px; top: 93px; }
    .intro-stage__lamp {
      top: 0;
      width: 18px;
      height: 20px;
      background: linear-gradient(#0f0c1d, #0f0c1d) 8px 0 / 2px 14px no-repeat;
    }
    .intro-stage__lamp::before {
      content: '';
      position: absolute;
      left: 0;
      top: 14px;
      width: 18px;
      height: 6px;
      border-radius: 3px 3px 0 0;
      background: #d9d2b8;
    }
    .intro-stage__cone {
      position: absolute;
      left: -32px;
      top: 20px;
      width: 82px;
      height: 108px;
      clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%);
      background: linear-gradient(rgba(255,236,170,.2), rgba(255,236,170,.03));
    }
    /* Pies en y=184 (pivote del kit 68/72): pisa el piso, entre las dos lámparas. */
    .intro-actor {
      left: 0;
      top: 116px;
      width: 48px;
      height: 72px;
      transform: translateX(168px);
    }
    .intro-actor--walking { animation: intro-walk 3600ms linear both; }
    .intro-actor__layer {
      position: absolute;
      inset: 0;
      background-repeat: no-repeat;
      background-position: var(--frame-x, 0) var(--frame-y, 0);
      image-rendering: pixelated;
    }
    /* No escala con el escenario: a 1× su borde superior debe quedar bajo el cuadro del actor (y = 188). */
    .intro-scene__caption {
      position: absolute;
      left: 12px;
      bottom: 4px;
      margin: 0;
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(5,8,14,.72);
      color: rgba(244,247,251,.86);
      font-size: .75rem;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      animation: intro-caption-in 400ms var(--psy-ease-out) 500ms both;
    }
    @keyframes intro-walk {
      from { transform: translateX(-48px); }
      to   { transform: translateX(168px); }
    }
    @keyframes intro-caption-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: none; }
    }
  `],
})
export class CaseIntroSceneComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Con movimiento reducido el personaje ya está en su sitio, de frente y quieto. */
  readonly reduceMotion = input(false);

  private readonly zone = inject(NgZone);
  private readonly store = inject(AvatarStore);
  private readonly kit = inject(KitService);
  // @ViewChild y no viewChild(): ts-jest no aplica la transformación JIT de Angular a las queries con signals.
  // `static: true` porque ninguno de los dos nodos está dentro de un bloque de control de flujo.
  @ViewChild('viewport', { static: true }) private viewport!: ElementRef<HTMLElement>;
  @ViewChild('actorEl', { static: true }) private actorEl!: ElementRef<HTMLElement>;

  readonly lamps = LAMP_CENTERS;
  readonly actor = computed(() => {
    const bundle = this.kit.bundle();
    return bundle ? introActor(resolveCharacter(bundle, { kind: 'jugador', avatar: toAvatarV2(this.store.avatar()) })) : null;
  });
  readonly phase = signal<'walk' | 'idle'>('walk');
  readonly phaseSheet = computed(() => {
    const actor = this.actor();
    return actor ? (this.phase() === 'walk' ? actor.walk : actor.idle) : null;
  });
  readonly layerUrl = computed(() => {
    const sheet = this.phaseSheet();
    const url = sheet ? sheetSourceUrl(sheet.source) : null;
    return url ? `url("${url}")` : 'none';
  });
  readonly layerSize = computed(() => {
    const sheet = this.phaseSheet();
    return sheet ? `${sheet.sheetWidth}px ${sheet.sheetHeight}px` : 'auto';
  });
  readonly layout = signal(stageLayout(INTRO_STAGE_WIDTH, INTRO_STAGE_HEIGHT));

  private frameId = 0;
  private phaseStartedAt: number | null = null;
  private lastFrame = -1;
  private resizeObserver?: ResizeObserver;

  ngOnInit(): void {
    if (this.reduceMotion()) this.phase.set('idle');
    // Mientras camina se baja la hoja de reposo: sin esto, al cambiar de hoja el personaje
    // desaparece hasta que llega la imagen (se nota con la caché fría o una red lenta).
    this.kit.load().then(() => {
      const actor = this.actor();
      const url = actor ? sheetSourceUrl(actor.idle.source) : null;
      if (url && !this.reduceMotion()) new Image().src = url;
    }, () => undefined);
  }

  ngAfterViewInit(): void {
    this.applyFrame(0);
    if (typeof ResizeObserver !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        this.resizeObserver = new ResizeObserver(() => this.zone.run(() => this.measure()));
        this.resizeObserver.observe(this.viewport.nativeElement);
      });
    }
    if (this.reduceMotion()) return;
    this.zone.runOutsideAngular(() => {
      this.frameId = requestAnimationFrame(now => this.tick(now));
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
  }

  /** Fin del `intro-walk` del propio actor: pasa a reposo de frente. */
  onWalkEnd(event: Event): void {
    if (event.target !== event.currentTarget || this.phase() !== 'walk') return;
    this.phase.set('idle');
    this.phaseStartedAt = null;
    this.applyFrame(0);
  }

  private measure(): void {
    const next = stageLayout(this.viewport.nativeElement.clientWidth, window.innerHeight * STAGE_HEIGHT_SHARE);
    const current = this.layout();
    if (next.scale !== current.scale || next.frameWidth !== current.frameWidth) this.layout.set(next);
  }

  private tick(now: number): void {
    this.phaseStartedAt ??= now;
    const sheet = this.phaseSheet();
    if (sheet) {
      const frame = frameAt(now - this.phaseStartedAt, sheet.fps, sheet.frames.length);
      if (frame !== this.lastFrame) this.applyFrame(frame);
    }
    this.frameId = requestAnimationFrame(next => this.tick(next));
  }

  private applyFrame(index: number): void {
    const frame = this.phaseSheet()?.frames[index] ?? { x: 0, y: 0 };
    const style = this.actorEl.nativeElement.style;
    style.setProperty('--frame-x', `${-frame.x}px`);
    style.setProperty('--frame-y', `${-frame.y}px`);
    this.lastFrame = index;
  }
}
