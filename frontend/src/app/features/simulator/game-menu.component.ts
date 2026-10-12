import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, ViewChild, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import Phaser from 'phaser';
import { SimulationService } from '../../core/api/simulation.service';
import { CatalogItem } from '../../core/models/simulation.model';
import { AvatarStore } from '../character/avatar.store';
import { toAvatarV2 } from '../character/kit/avatar-v2';
import { CharacterVisual, resolveCharacter } from '../character/kit/character-visual.resolver';
import { KIT_ORIGIN_X, KIT_ORIGIN_Y, ensureCharacterAnims, kitFrameIndex, kitSheetKey, playKitPose, queueCharacterSheets } from '../character/kit/kit-phaser';
import { KitService } from '../character/kit/kit.service';
import { LOBBY_BLEED, LOBBY_DOOR_RANGE, LOBBY_ROOM, lobbyFacadeBand, lobbyPose, nearestLobbyDoor } from './lobby-avatar.util';
import { LOBBY_DOOR_Y, lobbyDoorLayout } from './lobby-door-layout.util';
import { attachScrollKeyGuard, isTextEntryTarget, resolveInteractPress } from './keyboard-focus.util';
import { cameraBounds, integerZoom } from './pixel-scale.util';
import { pixelScaleConfig, watchHostSize } from './pixel-canvas';
import { PixelRender } from './pixel-render';
import { GameHelpComponent } from './game-help.component';
import { HelpModality } from './game-help.content';
import { SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';
import { COARSE_POINTER_QUERY, matchesMedia } from './pointer-modality.util';

interface MenuCallbacks {
  onEnter: (caseVersionId: number) => void;
  onFocus: (item: CatalogItem | null) => void;
}

/** Recordatorio de teclas que Phaser pinta en una esquina del lobby; sin teclado (puntero grueso) no se pinta. */
export function lobbyKeyboardHint(coarsePointer: boolean): string | null {
  return coarsePointer ? null : '← → / A D  mover · E entrar';
}

export class ClinicMenuScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container;
  /** Vértices al píxel (PHA-1) y resolución de los textos (PHA-2) con zoom de cámara. */
  private pixelRender?: PixelRender;
  private playerSprite?: Phaser.GameObjects.Sprite;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private doors: { item: CatalogItem; x: number }[] = [];
  private nearestId: number | null = null;
  private pointerTargetX: number | null = null;
  private view: 'left' | 'right' = 'right';
  private walking = false;
  private readonly worldW: number;
  private readonly spacing = 260;
  private readonly doorY = LOBBY_DOOR_Y;
  private readonly floorY = 380;

  constructor(
    private readonly items: CatalogItem[],
    private readonly visual: CharacterVisual | null,
    private readonly reduceMotion: boolean,
    private readonly cb: MenuCallbacks,
  ) {
    super('ClinicMenuScene');
    this.worldW = Math.max(960, 220 + items.length * this.spacing + 200);
  }

  preload() {
    // La hoja del kit del jugador: PNG publicado o avatar compuesto en el navegador.
    if (this.visual) queueCharacterSheets(this, this.visual);
  }

  create() {
    // Vértices al píxel también con zoom de cámara ≥ 2 (PHA-1, F0-7).
    this.pixelRender = new PixelRender(this).attach();
    const W = this.worldW, H = LOBBY_ROOM.height;
    // ── Layered clinic façade ────────────────────────────────────────────────
    // El cielo es el color de fondo del juego. Las franjas sangran más allá de la sala: con
    // zoom ×1 la vista es mayor que 960×540 y no debe verse el borde de la fachada.
    const band = lobbyFacadeBand(W);
    this.add.rectangle(band.x, 96, band.width, 168, 0x1c2a3a).setOrigin(0, 0);               // building band
    this.add.rectangle(band.x, 96, band.width, 6, 0x2f4763).setOrigin(0, 0);                 // cornice
    this.add.rectangle(band.x, this.floorY, band.width, H - this.floorY + LOBBY_BLEED, 0x1b2733).setOrigin(0, 0); // floor
    this.add.rectangle(band.x, this.floorY, band.width, 4, 0x2f4763).setOrigin(0, 0);        // floor edge
    // Entrance mat in front of the doors
    this.add.rectangle(band.x, this.doorY + 6, band.width, 26, 0x223247, 0.6).setOrigin(0, 0);

    this.doors = [];
    const door = lobbyDoorLayout(); // las puertas a la altura de los personajes (spec §13.1)
    this.items.forEach((item, i) => {
      const x = 220 + i * this.spacing;
      const open = item.unlocked;
      const fill = item.completed ? 0x2f7476 : open ? 0x33506f : 0x2a2e35;

      // Marco, hoja y manija
      this.add.rectangle(x, this.doorY, door.frame.width, door.frame.height, 0x12202f).setOrigin(0.5, 1)
        .setStrokeStyle(3, open ? 0x9dc0e8 : 0x555a63);
      const leaf = this.add.rectangle(x, this.doorY - door.leaf.bottomInset, door.leaf.width, door.leaf.height, fill).setOrigin(0.5, 1)
        .setStrokeStyle(2, open ? 0x6f97c4 : 0x44484f);
      this.add.rectangle(x + door.handle.dx, this.doorY + door.handle.dy, door.handle.width, door.handle.height, 0xdfe8f2, open ? 0.9 : 0.4); // manija

      // Available doors glow; locked doors show a lock icon
      if (open && !item.completed) {
        this.tweens.add({
          targets: leaf, alpha: 0.78, duration: 1200,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
      if (!open) {
        this.add.text(x, this.doorY + door.lockDy, '🔒', { fontSize: '14px' }).setOrigin(0.5);
      }

      this.add.text(x, this.doorY + door.titleDy, item.title, {
        fontFamily: 'sans-serif', fontSize: '15px', color: open ? '#e8f0f4' : '#7a808a',
        align: 'center', wordWrap: { width: 180 },
      }).setOrigin(0.5, 1);
      const badge = item.completed ? '✓ Resuelto' : open ? '▶ Disponible' : '🔒 Bloqueado';
      this.add.text(x, this.doorY + door.badgeDy, badge, {
        fontFamily: 'monospace', fontSize: '12px',
        color: item.completed ? '#8cbfa6' : open ? '#9dc0e8' : '#7a808a',
      }).setOrigin(0.5, 1);
      this.doors.push({ item, x });
    });

    // La identidad del editor llega al lobby con las hojas del kit; el marcador
    // geométrico queda como último recurso si la hoja no cargó.
    const shadow = this.add.ellipse(0, 0, 24, 7, 0x000000, 0.25);
    const parts: Phaser.GameObjects.GameObject[] = [shadow];
    if (this.visual && ensureCharacterAnims(this, this.visual)) {
      this.playerSprite = this.add.sprite(0, 0, kitSheetKey(this.visual, 'idle'), kitFrameIndex('idle', 'right'))
        .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
      playKitPose(this.playerSprite, this.visual, 'right', false, this.reduceMotion);
      parts.push(this.playerSprite);
    } else {
      const body = this.add.rectangle(0, -17, 22, 34, 0x8a6cff).setStrokeStyle(2, 0xffffff);
      const coat = this.add.rectangle(0, -13, 22, 16, 0xb9a8ff, 0.9);   // bajo de la bata
      const head = this.add.circle(0, -41, 9, 0xf2c9a0).setStrokeStyle(2, 0xffffff, 0.85);
      parts.push(body, coat, head);
    }
    this.player = this.add.container(220, this.floorY + 2, parts);
    this.applyCamera();
    this.scale.on('resize', () => this.applyCamera());

    // Phaser solo LEE las teclas: sin captura el navegador conserva Enter/Espacio en el botón
    // «Entrar al caso». `createCursorKeys` captura flechas, Espacio y Shift por su cuenta (de ahí
    // el apagado global); `update()` ignora lo que corresponda según el elemento con foco.
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.disableGlobalCapture();
    this.keys = this.input.keyboard?.addKeys('A,D,E,SPACE,ENTER', false) as Record<string, Phaser.Input.Keyboard.Key>;

    // Touch/puntero: tocar el escenario camina hacia ese punto (paridad con
    // teclado); el botón visible del banner completa la entrada al caso.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerTargetX = pointer.worldX;
    });
  }

  /** Zoom entero (spec §8.3) con la fachada de 960×540 como sala; sigue al jugador en horizontal. */
  private applyCamera(): void {
    const cam = this.cameras.main;
    const k = integerZoom(cam.width, cam.height, LOBBY_ROOM.width, LOBBY_ROOM.height);
    cam.setZoom(k);
    this.pixelRender?.refreshTexts(k);
    const bounds = cameraBounds(this.worldW, LOBBY_ROOM.height, cam.width / k, cam.height / k);
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    if (this.player) {
      cam.startFollow(this.player, true, 0.1, 0.1);
      cam.centerOn(this.player.x, this.player.y);
    }
  }

  override update(_t: number, dt: number) {
    if (!this.player || !this.keys) return;
    const speed = 0.3 * dt;
    // El foco se lee una vez por cuadro: escribiendo, el jugador no camina ni interactúa.
    const focus = document.activeElement;
    const typing = isTextEntryTarget(focus);
    let vx = 0;
    if (!typing && (this.cursors?.left?.isDown || this.keys['A']?.isDown)) vx -= speed;
    if (!typing && (this.cursors?.right?.isDown || this.keys['D']?.isDown)) vx += speed;
    if (vx !== 0) {
      this.pointerTargetX = null;  // el teclado manda sobre el destino táctil
    } else if (this.pointerTargetX !== null) {
      const delta = this.pointerTargetX - this.player.x;
      if (Math.abs(delta) <= Math.max(speed, 4)) {
        this.pointerTargetX = null;
      } else {
        vx = Math.sign(delta) * speed;
      }
    }
    this.player.setPosition(Phaser.Math.Clamp(this.player.x + vx, 40, this.worldW - 40), this.player.y);

    const pose = lobbyPose(vx);
    const view = pose.view ?? this.view;
    if (this.playerSprite && this.visual && (view !== this.view || pose.walking !== this.walking)) {
      playKitPose(this.playerSprite, this.visual, view, pose.walking, this.reduceMotion);
    }
    this.view = view;
    this.walking = pose.walking;

    const near = nearestLobbyDoor(this.doors, this.player.x, LOBBY_DOOR_RANGE);
    const nextId = near ? near.item.caseVersionId : null;
    if (nextId !== this.nearestId) {
      this.nearestId = nextId;
      this.cb.onFocus(near?.item ?? null);
    }

    // JustDown se lee SIEMPRE, los tres, aunque el resultado se descarte: `Key._justDown` sigue
    // en true hasta que alguien lo lee. Con foco en un botón, Espacio y Enter los activa el
    // navegador (una sola navegación); E sigue siendo del juego.
    const pressed = resolveInteractPress(focus, {
      e: Phaser.Input.Keyboard.JustDown(this.keys['E']),
      space: Phaser.Input.Keyboard.JustDown(this.keys['SPACE']),
      enter: Phaser.Input.Keyboard.JustDown(this.keys['ENTER']),
    });
    if (pressed && near) {
      if (near.item.unlocked) this.cb.onEnter(near.item.caseVersionId);
      else this.cameras.main.shake(180, 0.004);
    }
  }
}

@Component({
  selector: 'app-game-menu',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressBarModule, GameHelpComponent],
  template: `
    <div class="menu-root">
      <!-- Un h1 por pantalla (plan visual F3-6): la sala es un mundo a sangre, así que va visualmente oculto. -->
      <h1 class="sr-only">Sala de simulación</h1>
      @if (loading()) { <mat-progress-bar mode="indeterminate" aria-label="Cargando casos" /> }
      @if (error()) {
        <div class="menu-error" role="alert"><mat-icon>error</mat-icon><span>{{ error() }}</span></div>
      }
      <!-- GAME-09: además de las teclas de Phaser, el host enfocable maneja
           E/Enter/Espacio a nivel DOM — ruta determinista para teclado y
           lectores; la guardia entering() garantiza UNA sola navegación. -->
      @if (keyboardHint(); as hint) { <p class="lobby-help" aria-hidden="true">{{ hint }}</p> }
      <div class="lobby-sign" aria-hidden="true">CLÍNICA · SIEP</div>
      <div #host class="phaser-host" role="application" tabindex="0" (click)="focusCanvas()"
           (keydown.e)="enterFocused($event)" (keydown.enter)="enterFocused($event)"
           (keydown.space)="enterFocused($event)"
           [attr.aria-label]="hostLabel()"></div>

      <button #helpTrigger type="button" class="menu-help-btn" (click)="toggleHelp()"
              [attr.aria-expanded]="helpOpen()" [attr.aria-controls]="helpOpen() ? 'lobby-help' : null">
        <mat-icon aria-hidden="true">help_outline</mat-icon>
        <span>Cómo se juega</span>
      </button>

      <!-- La misma pantalla «Cómo se juega» del juego (una sola fuente del texto, F§5.8). Esc y «Cerrar ayuda» la cierran. -->
      @if (helpOpen()) {
        <div class="menu-help-layer" (keydown.escape)="closeHelp()" (click)="onHelpBackdrop($event)">
          <app-game-help view="screen" [modality]="helpModality()" [safeExitPromise]="safeExitPromise"
                         (closed)="closeHelp()" />
        </div>
      }

      @if (focused(); as f) {
        <div class="case-banner" [class.case-banner--locked]="!f.unlocked" aria-live="polite">
          <strong>{{ f.title }}</strong>
          <span>{{ f.completed ? 'Resuelto' : f.unlocked ? 'Disponible' : 'Bloqueado — completa el caso anterior' }}</span>
          <!-- Control VISIBLE y accesible (sin botones sr-only enfocables):
               misma navegación única que la tecla E. -->
          <button class="banner-enter psy-button psy-button--primary" type="button"
            [disabled]="!f.unlocked || !!entering()" (click)="enter(f.caseVersionId)">
            {{ f.unlocked ? (coarsePointer() ? 'Entrar al caso' : 'Entrar al caso (E)') : 'Bloqueado' }}
          </button>
        </div>
      }

      @if (entering(); as title) {
        <div class="enter-card" aria-hidden="true"><p class="psy-eyebrow">Entrando al caso</p><h2>{{ title }}</h2></div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host { display: block; }
    .menu-root { position: fixed; inset: 0; overflow: hidden; background: #0a0f14; }
    .phaser-host { position: absolute; inset: 0; }
    .phaser-host:focus-visible { outline: 3px solid rgba(157,192,232,.75); outline-offset: -3px; }
    :host ::ng-deep .phaser-host canvas { display: block; }
    .lobby-help { position: absolute; top: 8px; left: 12px; z-index: 10; margin: 0; color: rgba(232,240,244,.5); font: 13px/1.2 monospace; pointer-events: none; }
    .lobby-sign { position: absolute; top: 36px; left: 24px; z-index: 10; padding: 8px 14px; border-radius: 4px; background: rgba(18,32,47,.92); border: 2px solid rgba(79,124,172,.5); color: #9dc0e8; font: 20px/1 monospace; pointer-events: none; }
    .menu-error {
      position: absolute; inset: 0; z-index: 30; display: flex; gap: 12px;
      align-items: center; justify-content: center; color: #e8f0f4; background: rgba(8,12,18,.9);
    }
    .case-banner {
      position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 20;
      display: grid; gap: 4px; text-align: center; padding: 12px 22px; border-radius: 14px;
      background: rgba(8,12,18,.86); border: 1px solid rgba(79,163,165,.35); color: #e8f0f4; min-width: 280px;
    }
    .case-banner strong { font-size: 1.05rem; color: #9dc0e8; }
    .case-banner span { font-size: .82rem; color: rgba(232,240,244,.72); }
    .menu-help-btn {
      position: absolute; top: 12px; right: 12px; z-index: 25;
      display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px;
      border: 1px solid rgba(157,192,232,.45); border-radius: 12px;
      background: rgba(8,12,18,.86); color: #e8f0f4; font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer;
    }
    .menu-help-btn:hover { border-color: rgba(157,192,232,.85); background: rgba(33,52,76,.9); }
    .menu-help-btn:focus-visible { outline: 2px solid rgba(157,192,232,.9); outline-offset: 2px; }
    .menu-help-btn mat-icon { font-size: 20px; width: 20px; height: 20px; color: #9dc0e8; }
    /* Capa que cubre el lobby mientras la ayuda está abierta: el foco queda dentro (la pantalla lo atrapa) y el
       escenario de Phaser no recibe toques por debajo. */
    .menu-help-layer {
      position: absolute; inset: 0; z-index: 30; display: grid; place-items: center;
      padding: 8px 12px; background: rgba(5,8,12,.78);
    }
    .menu-help-layer app-game-help { width: min(640px, 100%); }
    .banner-enter { margin-top: 6px; min-height: 44px; }
    .banner-enter:disabled { opacity: .55; cursor: not-allowed; }
    .banner-enter:focus-visible { outline: 2px solid rgba(157,192,232,.85); outline-offset: 2px; }
    .case-banner--locked { border-color: rgba(168,80,98,.4); }
    .case-banner--locked span { color: rgba(212,160,128,.85); }
    .enter-card {
      position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 6px; text-align: center;
      background: rgba(8,12,18,.96); color: #e8f0f4;
      animation: enter-open 360ms cubic-bezier(.2,.7,.2,1) both;
    }
    .enter-card .psy-eyebrow { letter-spacing: .14em; }
    .enter-card h2 {
      margin: 0; font-family: 'Poppins', system-ui, sans-serif; font-size: 1.8rem;
      animation: enter-rise 420ms cubic-bezier(.2,.7,.2,1) 80ms both;
    }
    @keyframes enter-open { from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: scale(1); } }
    @keyframes enter-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) {
      .enter-card, .enter-card h2 { animation: none; }
    }
  `]
})
export class GameMenuComponent implements OnDestroy {
  private readonly sim = inject(SimulationService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly avatarStore = inject(AvatarStore);
  private readonly kit = inject(KitService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly catalog = signal<CatalogItem[]>([]);
  readonly focused = signal<CatalogItem | null>(null);
  readonly entering = signal<string>('');
  /** Sin teclado: se quitan los textos que prometen teclas (la lectura es puntual, el lobby no cambia de puntero). */
  readonly coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY));
  readonly keyboardHint = computed(() => lobbyKeyboardHint(this.coarsePointer()));
  readonly helpOpen = signal(false);
  readonly helpModality = computed<HelpModality>(() => this.coarsePointer() ? 'touch' : 'keyboard');
  /** Misma bandera que el juego: la promesa de «Salida segura» solo se escribe cuando es cierta en todos los estados. */
  protected readonly safeExitPromise = SAFE_EXIT_ALWAYS_REACHABLE;
  readonly hostLabel = computed(() => this.coarsePointer()
    ? 'Menú de casos. Toca el suelo para caminar hasta una puerta disponible y usa el botón «Entrar al caso».'
    : 'Menú de casos. Flechas o A/D para moverte, toca el suelo para caminar, E para entrar a una puerta disponible.');

  private game?: Phaser.Game;
  /** Retira el bloqueo de desplazamiento por teclado (flechas y Espacio) de `window`. */
  private detachScrollKeyGuard?: () => void;
  private detachHostWatch?: () => void;
  private booting = false;
  private destroyed = false;
  // number explícito (no ReturnType<typeof window.setTimeout>): con @types/node en el
  // programa de tipos de los specs, ese ReturnType resuelve a NodeJS.Timeout aunque la
  // llamada real a window.setTimeout en el navegador siga devolviendo number.
  private enterTimer?: number;
  private host?: ElementRef<HTMLDivElement>;
  private helpTrigger?: ElementRef<HTMLButtonElement>;

  @ViewChild('helpTrigger')
  set helpTriggerRef(value: ElementRef<HTMLButtonElement> | undefined) { this.helpTrigger = value; }

  @ViewChild('host')
  set hostRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.host = value;
    if (value) this.load();
  }

  private load() {
    this.sim.getCatalog().subscribe({
      next: items => { this.catalog.set(items); this.loading.set(false); this.boot(items); },
      error: () => { this.error.set('No pudimos cargar los casos.'); this.loading.set(false); },
    });
  }

  private boot(items: CatalogItem[]) {
    if (!this.host || this.game || this.booting) return;
    this.booting = true;
    // Identidad del jugador: mismo almacén que editor, mundo y resultado; el visual sale del kit.
    this.avatarStore.loadSaved();
    const avatar = toAvatarV2(this.avatarStore.avatar());
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    // Sin kit, o con uno que no se puede resolver, el lobby arranca igual con el marcador geométrico.
    this.kit.load()
      .then(bundle => resolveCharacter(bundle, { kind: 'jugador', avatar }))
      .catch(() => null)
      .then(visual => {
        this.booting = false;
        if (this.destroyed || !this.host || this.game) return;
        this.zone.runOutsideAngular(() => {
          const scene = new ClinicMenuScene(items, visual, reduceMotion, {
            onEnter: id => this.zone.run(() => this.enter(id)),
            onFocus: item => this.zone.run(() => this.focused.set(item)),
          });
          this.game = new Phaser.Game({
            type: Phaser.AUTO,
            parent: this.host!.nativeElement,
            backgroundColor: '#0e141a',
            pixelArt: true,
            roundPixels: true, // con zoom ≥ 2 lo completa PixelRender en create() (F0-7)
            scale: pixelScaleConfig(this.host!.nativeElement),
            scene,
          });
          this.detachHostWatch = watchHostSize(this.game, this.host!.nativeElement);
          // Sin la captura de Phaser, flechas y Espacio desplazarían la página. Se arma DESPUÉS de
          // crear el juego: Phaser descarta los `keydown` ya cancelados.
          this.detachScrollKeyGuard = attachScrollKeyGuard(this.zone);
        });
        // Foco inicial explícito: los controles de teclado quedan activos sin un click previo (GAME-09).
        window.setTimeout(() => this.focusCanvas(), 0);
      });
  }

  focusCanvas() {
    this.host?.nativeElement.focus({ preventScroll: true });
  }

  /** «Cómo se juega»: pantalla de ayuda sobre el lobby. Al abrir, el foco entra en ella; al cerrar, vuelve al botón. */
  toggleHelp() {
    if (this.helpOpen()) { this.closeHelp(); return; }
    this.helpOpen.set(true);
  }

  /** Un toque fuera de la pantalla de ayuda (sobre la capa) también la cierra. */
  onHelpBackdrop(event: Event) {
    if (event.target === event.currentTarget) this.closeHelp();
  }

  closeHelp() {
    if (!this.helpOpen()) return;
    this.helpOpen.set(false);
    this.helpTrigger?.nativeElement.focus();
  }

  /** Entrada por teclado a la puerta enfocada (E/Enter/Espacio sobre el host). */
  enterFocused(event: Event) {
    const f = this.focused();
    if (!f) return;
    event.preventDefault();
    if (!f.unlocked) return;
    this.enter(f.caseVersionId);
  }

  enter(caseVersionId: number) {
    // Con la ayuda abierta, la E del juego (Phaser la sigue leyendo) no debe llevar al caso a quien está leyendo.
    if (this.entering() || this.helpOpen()) return;
    const item = this.catalog().find(c => c.caseVersionId === caseVersionId);
    if (item && !item.unlocked) return;
    this.entering.set(item?.title ?? 'Caso');
    this.enterTimer = window.setTimeout(() => this.router.navigate(['/portal/simulador', caseVersionId]), 900);
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.detachScrollKeyGuard?.();
    this.detachScrollKeyGuard = undefined;
    this.detachHostWatch?.();
    this.detachHostWatch = undefined;
    this.game?.destroy(true);
    if (this.enterTimer) clearTimeout(this.enterTimer);
  }
}
