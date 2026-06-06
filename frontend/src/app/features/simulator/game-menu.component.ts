import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import Phaser from 'phaser';
import { SimulationService } from '../../core/api/simulation.service';
import { CatalogItem } from '../../core/models/simulation.model';

interface MenuCallbacks {
  onEnter: (caseVersionId: number) => void;
  onFocus: (item: CatalogItem | null) => void;
}

class ClinicMenuScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private doors: { item: CatalogItem; x: number }[] = [];
  private nearestId: number | null = null;
  private readonly worldW: number;
  private readonly spacing = 260;
  private readonly doorY = 320;
  private readonly floorY = 380;

  constructor(private readonly items: CatalogItem[], private readonly cb: MenuCallbacks) {
    super('ClinicMenuScene');
    this.worldW = Math.max(960, 220 + items.length * this.spacing + 200);
  }

  create() {
    const W = this.worldW, H = 540;
    this.cameras.main.setBounds(0, 0, W, H);
    // ── Layered clinic façade ────────────────────────────────────────────────
    this.add.rectangle(0, 0, W, H, 0x0e141a).setOrigin(0, 0);                  // sky/base
    this.add.rectangle(0, 96, W, 168, 0x1c2a3a).setOrigin(0, 0);               // building band
    this.add.rectangle(0, 96, W, 6, 0x2f4763).setOrigin(0, 0);                 // cornice
    this.add.rectangle(0, this.floorY, W, H - this.floorY, 0x1b2733).setOrigin(0, 0); // floor
    this.add.rectangle(0, this.floorY, W, 4, 0x2f4763).setOrigin(0, 0);        // floor edge
    // Entrance mat in front of the doors
    this.add.rectangle(0, this.doorY + 6, W, 26, 0x223247, 0.6).setOrigin(0, 0);

    // Backlit clinic sign — pinned top-left header (screen space), above the
    // building band, so it never collides with door titles inside the band.
    const sign = this.add.rectangle(24, 36, 232, 36, 0x12202f, 0.92).setOrigin(0, 0)
      .setScrollFactor(0).setStrokeStyle(2, 0x4f7cac, 0.5);
    this.add.text(sign.x + 14, 54, 'CLÍNICA · SIEP', {
      fontFamily: 'monospace', fontSize: '20px', color: '#9dc0e8',
    }).setOrigin(0, 0.5).setScrollFactor(0);

    this.doors = [];
    this.items.forEach((item, i) => {
      const x = 220 + i * this.spacing;
      const open = item.unlocked;
      const fill = item.completed ? 0x2f7476 : open ? 0x33506f : 0x2a2e35;

      // Frame, leaf, and handle
      this.add.rectangle(x, this.doorY, 108, 152, 0x12202f).setOrigin(0.5, 1)
        .setStrokeStyle(3, open ? 0x9dc0e8 : 0x555a63);
      const leaf = this.add.rectangle(x, this.doorY - 6, 88, 134, fill).setOrigin(0.5, 1)
        .setStrokeStyle(2, open ? 0x6f97c4 : 0x44484f);
      this.add.rectangle(x + 26, this.doorY - 74, 6, 12, 0xdfe8f2, open ? 0.9 : 0.4); // handle

      // Available doors glow; locked doors show a lock icon
      if (open && !item.completed) {
        this.tweens.add({
          targets: leaf, alpha: 0.78, duration: 1200,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
      if (!open) {
        this.add.text(x, this.doorY - 74, '🔒', { fontSize: '20px' }).setOrigin(0.5);
      }

      this.add.text(x, this.doorY - 176, item.title, {
        fontFamily: 'sans-serif', fontSize: '15px', color: open ? '#e8f0f4' : '#7a808a',
        align: 'center', wordWrap: { width: 180 },
      }).setOrigin(0.5, 1);
      const badge = item.completed ? '✓ Resuelto' : open ? '▶ Disponible' : '🔒 Bloqueado';
      this.add.text(x, this.doorY - 150, badge, {
        fontFamily: 'monospace', fontSize: '12px',
        color: item.completed ? '#8cbfa6' : open ? '#9dc0e8' : '#7a808a',
      }).setOrigin(0.5, 1);
      this.doors.push({ item, x });
    });

    const shadow = this.add.ellipse(0, 18, 22, 6, 0x000000, 0.25);
    const body = this.add.rectangle(0, 0, 22, 34, 0x8a6cff).setStrokeStyle(2, 0xffffff);
    const coat = this.add.rectangle(0, 4, 22, 16, 0xb9a8ff, 0.9);   // lab-coat hem
    const head = this.add.circle(0, -24, 9, 0xf2c9a0).setStrokeStyle(2, 0xffffff, 0.85);
    this.player = this.add.container(220, this.floorY - 17, [shadow, body, coat, head]);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys('A,D,E,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;

    this.add.text(12, 12, '← → / A D  mover · E entrar', {
      fontFamily: 'monospace', fontSize: '13px', color: 'rgba(232,240,244,0.5)',
    }).setScrollFactor(0);
  }

  override update(_t: number, dt: number) {
    if (!this.player || !this.keys) return;
    const speed = 0.3 * dt;
    let vx = 0;
    if (this.cursors?.left?.isDown || this.keys['A']?.isDown) vx -= speed;
    if (this.cursors?.right?.isDown || this.keys['D']?.isDown) vx += speed;
    this.player.setPosition(Phaser.Math.Clamp(this.player.x + vx, 40, this.worldW - 40), this.player.y);

    let near: { item: CatalogItem; x: number } | null = null;
    let nd = Infinity;
    for (const d of this.doors) {
      const dist = Math.abs(d.x - this.player.x);
      if (dist < nd) { nd = dist; near = d; }
    }
    const nextId = near && nd <= 70 ? near.item.caseVersionId : null;
    if (nextId !== this.nearestId) {
      this.nearestId = nextId;
      this.cb.onFocus(near && nd <= 70 ? near.item : null);
    }

    const pressed =
      Phaser.Input.Keyboard.JustDown(this.keys['E']) ||
      Phaser.Input.Keyboard.JustDown(this.keys['SPACE']) ||
      Phaser.Input.Keyboard.JustDown(this.keys['ENTER']);
    if (pressed && near && nd <= 70) {
      if (near.item.unlocked) this.cb.onEnter(near.item.caseVersionId);
      else this.cameras.main.shake(180, 0.004);
    }
  }
}

@Component({
  selector: 'app-game-menu',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="menu-root">
      @if (loading()) { <mat-progress-bar mode="indeterminate" aria-label="Cargando casos" /> }
      @if (error()) {
        <div class="menu-error" role="alert"><mat-icon>error</mat-icon><span>{{ error() }}</span></div>
      }
      <div #host class="phaser-host" role="application"
           aria-label="Menú de casos. Flechas o A/D para moverte, E para entrar a una puerta disponible."></div>

      @if (focused(); as f) {
        <div class="case-banner" [class.case-banner--locked]="!f.unlocked" aria-live="polite">
          <strong>{{ f.title }}</strong>
          <span>{{ f.completed ? 'Resuelto' : f.unlocked ? 'Disponible — pulsa E para entrar' : 'Bloqueado — completa el caso anterior' }}</span>
        </div>
      }

      @if (entering(); as title) {
        <div class="enter-card" aria-hidden="true"><p class="psy-eyebrow">Entrando al caso</p><h2>{{ title }}</h2></div>
      }

      <ul class="sr-only">
        @for (c of catalog(); track c.caseVersionId) {
          <li><button type="button" [disabled]="!c.unlocked" (click)="enter(c.caseVersionId)">
            {{ c.title }} — {{ c.completed ? 'resuelto' : c.unlocked ? 'disponible' : 'bloqueado' }}
          </button></li>
        }
      </ul>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .menu-root { position: fixed; inset: 0; overflow: hidden; background: #0a0f14; }
    .phaser-host { position: absolute; inset: 0; }
    :host ::ng-deep .phaser-host canvas { display: block; width: 100% !important; height: 100% !important; }
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
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `]
})
export class GameMenuComponent implements OnDestroy {
  private readonly sim = inject(SimulationService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly catalog = signal<CatalogItem[]>([]);
  readonly focused = signal<CatalogItem | null>(null);
  readonly entering = signal<string>('');

  private game?: Phaser.Game;
  private enterTimer?: ReturnType<typeof window.setTimeout>;
  private host?: ElementRef<HTMLDivElement>;

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
    if (!this.host || this.game) return;
    this.zone.runOutsideAngular(() => {
      const scene = new ClinicMenuScene(items, {
        onEnter: id => this.zone.run(() => this.enter(id)),
        onFocus: item => this.zone.run(() => this.focused.set(item)),
      });
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.host!.nativeElement,
        width: 960, height: 540,
        backgroundColor: '#0e141a',
        pixelArt: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 540 },
        scene,
      });
    });
  }

  enter(caseVersionId: number) {
    if (this.entering()) return;
    const item = this.catalog().find(c => c.caseVersionId === caseVersionId);
    if (item && !item.unlocked) return;
    this.entering.set(item?.title ?? 'Caso');
    this.enterTimer = window.setTimeout(() => this.router.navigate(['/portal/simulador', caseVersionId]), 900);
  }

  ngOnDestroy() {
    this.game?.destroy(true);
    if (this.enterTimer) clearTimeout(this.enterTimer);
  }
}
