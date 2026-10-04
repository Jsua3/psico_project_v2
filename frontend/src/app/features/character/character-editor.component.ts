import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { AvatarStore } from './avatar.store';
import { avatarSummary, chooseElenco, choosePersonalizado, toggleAccessory, withBata, withCustom } from './character-editor.util';
import {
  ACCESSORIES,
  AVATAR_LABELS,
  AccessoryId,
  AvatarPersonalizado,
  COMPLEXIONS,
  HAIRS,
  HAIR_COLORS,
  PLAYABLE_IDS,
  PlayableId,
  SKINS,
} from './kit/avatar-v2';
import { BATA_VARIANT, resolveCharacter } from './kit/character-visual.resolver';
import { KitFigureComponent } from './kit/kit-figure.component';
import { KitService } from './kit/kit.service';

@Component({
  selector: 'app-character-editor',
  standalone: true,
  imports: [RouterLink, KitFigureComponent],
  template: `
    <div class="ce-container" id="main-content" tabindex="-1">
      <header class="ce-header glass">
        <div>
          <p class="ce-kicker">Editor de personaje</p>
          <h1>Personaliza tu avatar profesional</h1>
          <p class="ce-sub">Crea la identidad con la que entrarás a los casos. No afecta tu evaluación.</p>
        </div>
        <div class="ce-id">
          <span class="ce-chip">Programa: Psicología</span>
          <span class="ce-chip ce-chip--soft">Rol: {{ roleLabel() }}</span>
          <a class="ce-btn ce-btn--ghost" routerLink="/portal/dashboard">Volver</a>
        </div>
      </header>

      @if (!bundle()) {
        <section class="ce-loading glass" role="status">
          @if (loadError()) {
            <span>No pudimos cargar los personajes.</span>
            <button type="button" class="ce-btn" (click)="loadKit()">Reintentar</button>
          } @else {
            <span>Cargando personajes…</span>
          }
        </section>
      } @else {
        <div class="ce-grid">
          <section class="ce-panel glass" aria-label="Personaje">
            <p class="ce-section">Elenco</p>
            <div class="ce-cast" role="radiogroup" aria-label="Personaje del elenco">
              @for (member of cast(); track member.id) {
                <button type="button" class="ce-cast-card" [class.sel]="isElenco(member.id)"
                  role="radio" [attr.aria-checked]="isElenco(member.id)" (click)="selectElenco(member.id)">
                  <app-kit-figure [visual]="member.visual" [scale]="2" />
                  <span>{{ member.label }}</span>
                </button>
              }
              <button type="button" class="ce-cast-card" [class.sel]="!!custom()"
                role="radio" [attr.aria-checked]="!!custom()" (click)="selectPersonalizado()">
                <app-kit-figure [visual]="customVisual()" [scale]="2" />
                <span>Personalizado</span>
              </button>
            </div>

            @if (custom(); as c) {
              <p class="ce-section">Complexión</p>
              <div class="ce-opts" role="radiogroup" aria-label="Complexión">
                @for (id of complexions; track id) {
                  <button type="button" class="ce-opt" [class.sel]="c.complexion === id" role="radio"
                    [attr.aria-checked]="c.complexion === id" (click)="setCustom({ complexion: id })">{{ labels.complexion[id] }}</button>
                }
              </div>
              <p class="ce-section">Piel</p>
              <div class="ce-swatches" role="radiogroup" aria-label="Tono de piel">
                @for (id of skins; track id; let i = $index) {
                  <button type="button" class="ce-swatch" [class.sel]="c.skin === id" [style.background]="swatch(id)"
                    [title]="'Tono ' + (i + 1)" [attr.aria-label]="'Tono ' + (i + 1)" role="radio"
                    [attr.aria-checked]="c.skin === id" (click)="setCustom({ skin: id })"></button>
                }
              </div>
              <p class="ce-section">Peinado</p>
              <div class="ce-opts" role="radiogroup" aria-label="Peinado">
                @for (id of hairs; track id) {
                  <button type="button" class="ce-opt" [class.sel]="c.hair === id" role="radio"
                    [attr.aria-checked]="c.hair === id" (click)="setCustom({ hair: id })">{{ labels.hair[id] }}</button>
                }
              </div>
              <p class="ce-section">Color de pelo</p>
              <div class="ce-swatches" role="radiogroup" aria-label="Color de pelo">
                @for (id of hairColors; track id) {
                  <button type="button" class="ce-swatch" [class.sel]="c.hairColor === id" [style.background]="swatch(id)"
                    [title]="labels.hairColor[id]" [attr.aria-label]="labels.hairColor[id]" role="radio"
                    [attr.aria-checked]="c.hairColor === id" (click)="setCustom({ hairColor: id })"></button>
                }
              </div>
              <p class="ce-section">Accesorios</p>
              <div class="ce-opts">
                @for (id of accessories; track id) {
                  <label class="ce-check">
                    <input type="checkbox" [checked]="c.accessories.includes(id)" (change)="toggleAccessory(id)" />
                    <span>{{ labels.accessory[id] }}</span>
                  </label>
                }
              </div>
            }
          </section>

          <section class="ce-stage glass" aria-label="Vista previa del avatar">
            <div class="ce-halo"></div>
            <div class="ce-views">
              @for (view of views; track view.id) {
                <figure class="ce-view">
                  <app-kit-figure [visual]="visual()" [view]="view.id" [sheet]="motion()" [scale]="4" [animated]="true" />
                  <figcaption>{{ view.label }}</figcaption>
                </figure>
              }
            </div>
            <div class="ce-pose" role="radiogroup" aria-label="Animación">
              <button type="button" class="ce-opt" [class.sel]="motion() === 'idle'" role="radio"
                [attr.aria-checked]="motion() === 'idle'" (click)="motion.set('idle')">Reposo</button>
              <button type="button" class="ce-opt" [class.sel]="motion() === 'walk'" role="radio"
                [attr.aria-checked]="motion() === 'walk'" (click)="motion.set('walk')">Caminata</button>
            </div>
            <p class="sr-only">{{ summary() }}</p>
          </section>

          <section class="ce-panel glass" aria-label="Uniforme y resumen">
            <p class="ce-section">Uniforme de Psicología</p>
            <div class="ce-uniforms" role="radiogroup" aria-label="Bata">
              @for (option of bataOptions(); track option.bata) {
                <button type="button" class="ce-uniform" [class.sel]="avatar().bata === option.bata" role="radio"
                  [attr.aria-checked]="avatar().bata === option.bata" (click)="setBata(option.bata)">
                  <app-kit-figure [visual]="option.visual" [scale]="2" />
                  <span>{{ option.label }}</span>
                </button>
              }
            </div>
            <p class="ce-section">Resumen</p>
            <ul class="ce-summary">
              <li><span>Rol</span><strong>{{ roleLabel() }}</strong></li>
              <li><span>Personaje</span><strong>{{ characterLabel() }}</strong></li>
              <li><span>Bata</span><strong>{{ avatar().bata ? 'Con bata' : 'Sin bata' }}</strong></li>
            </ul>
          </section>
        </div>
      }

      <footer class="ce-footer glass">
        <button type="button" class="ce-btn ce-btn--ghost" (click)="restablecer()">Restablecer</button>
        <button type="button" class="ce-btn ce-btn--primary" (click)="guardar()">Guardar personaje</button>
        <button type="button" class="ce-btn ce-btn--go" (click)="continuar()">Continuar</button>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ce-container {
      --pp: #7C4DFF; --pl: #B69CFF; --ink: #F4F7FB; --ink-soft: rgba(244,247,251,.72);
      --surface: rgba(27,33,51,.72); --surface-2: rgba(18,24,42,.6); --border: rgba(182,156,255,.22);
      --glow: 0 18px 48px -28px rgba(124,77,255,.6);
      min-height: 100%; padding: 18px; color: var(--ink);
      background:
        linear-gradient(90deg, rgba(124,77,255,.05) 1px, transparent 1px) 0 0 / 26px 26px,
        linear-gradient(rgba(124,77,255,.05) 1px, transparent 1px) 0 0 / 26px 26px,
        linear-gradient(180deg, #111827 0%, #0e1322 100%);
    }
    .glass { background: var(--surface); backdrop-filter: blur(18px) saturate(125%); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--glow); }
    .ce-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 20px; margin-bottom: 14px; }
    .ce-kicker { margin: 0; color: var(--pl); font-size: .72rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
    .ce-header h1 { margin: 4px 0; font-size: clamp(1.2rem,2vw,1.6rem); color: var(--ink); }
    .ce-sub { margin: 0; color: var(--ink-soft); font-size: .86rem; }
    .ce-id { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ce-chip { padding: 6px 12px; border-radius: 999px; background: rgba(124,77,255,.16); border: 1px solid rgba(124,77,255,.4); color: #d6c6ff; font-size: .76rem; font-weight: 800; }
    .ce-chip--soft { background: var(--surface-2); border-color: var(--border); color: var(--ink-soft); }
    .ce-loading { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 240px; padding: 24px; color: var(--ink-soft); }
    .ce-grid { display: grid; grid-template-columns: 310px minmax(0,1fr) 300px; gap: 14px; align-items: start; }
    .ce-panel { padding: 16px; display: grid; gap: 12px; max-height: calc(100vh - 230px); overflow-y: auto; }
    .ce-section { margin: 4px 0 0; color: var(--pl); font-size: .72rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .ce-opts { display: flex; flex-wrap: wrap; gap: 6px; }
    .ce-cast { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
    .ce-cast-card { display: grid; justify-items: center; gap: 4px; padding: 8px 4px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink-soft); font-size: .74rem; font-weight: 800; cursor: pointer; transition: all .15s; }
    .ce-cast-card:hover { border-color: rgba(182,156,255,.5); color: var(--ink); }
    .ce-cast-card.sel { border-color: var(--pl); background: rgba(124,77,255,.18); color: #e7ddff; }
    .ce-opt { padding: 6px 11px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink-soft); font-size: .78rem; font-weight: 700; cursor: pointer; transition: all .15s; }
    .ce-opt:hover { border-color: rgba(182,156,255,.5); color: var(--ink); }
    .ce-opt.sel { background: rgba(124,77,255,.2); border-color: var(--pl); color: #e7ddff; }
    .ce-check { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink-soft); font-size: .78rem; font-weight: 700; cursor: pointer; }
    .ce-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
    .ce-swatch { width: 31px; height: 31px; border-radius: 50%; border: 2px solid rgba(255,255,255,.2); cursor: pointer; transition: transform .15s, border-color .15s, box-shadow .15s; }
    .ce-swatch.sel { border-color: var(--pl); box-shadow: 0 0 0 3px rgba(124,77,255,.3); transform: scale(1.08); }
    .ce-stage { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; min-height: 420px; overflow: hidden; }
    .ce-halo { position: absolute; bottom: 70px; width: 220px; height: 60px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(124,77,255,.45), transparent 70%); filter: blur(6px); }
    .ce-views { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
    .ce-view { margin: 0; display: grid; justify-items: center; gap: 6px; color: var(--ink-soft); font-size: .76rem; font-weight: 800; }
    .ce-pose { display: flex; gap: 8px; z-index: 1; }
    .ce-uniforms { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .ce-uniform { display: grid; justify-items: center; gap: 4px; padding: 10px 6px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink-soft); font-size: .78rem; font-weight: 800; cursor: pointer; transition: all .15s; }
    .ce-uniform.sel { border-color: var(--pl); background: rgba(124,77,255,.16); color: #e7ddff; }
    .ce-summary { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
    .ce-summary li { display: flex; justify-content: space-between; gap: 10px; font-size: .82rem; }
    .ce-summary span { color: var(--ink-soft); }
    .ce-summary strong { color: var(--ink); text-align: right; }
    .ce-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 16px; margin-top: 14px; }
    .ce-btn { min-height: 42px; padding: 8px 18px; border-radius: 12px; font-weight: 900; cursor: pointer; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink); transition: all .15s; }
    .ce-btn--ghost { background: transparent; color: var(--ink-soft); }
    .ce-btn--primary { background: rgba(124,77,255,.2); border-color: rgba(182,156,255,.5); color: #e7ddff; }
    .ce-btn--go { background: linear-gradient(90deg, var(--pp), #6336e0); border-color: transparent; color: #fff; }
    .ce-btn:hover { box-shadow: var(--glow); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
    @media (max-width: 1080px) { .ce-grid { grid-template-columns: 1fr; } .ce-panel { max-height: none; } }
    @media (prefers-reduced-motion: reduce) { .ce-swatch, .ce-opt, .ce-btn, .ce-uniform { transition: none; } }
  `]
})
export class CharacterEditorComponent {
  readonly store = inject(AvatarStore);
  private readonly kit = inject(KitService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  readonly avatar = this.store.avatar;
  readonly bundle = this.kit.bundle;
  readonly loadError = signal(false);
  readonly motion = signal<'idle' | 'walk'>('idle');
  /** Último personalizado visto, para volver a él después de probar el elenco. */
  private readonly lastCustom = signal<AvatarPersonalizado | null>(null);

  readonly complexions = COMPLEXIONS;
  readonly skins = SKINS;
  readonly hairs = HAIRS;
  readonly hairColors = HAIR_COLORS;
  readonly accessories = ACCESSORIES;
  readonly labels = AVATAR_LABELS;
  readonly views = [
    { id: 'down', label: 'Frente' }, { id: 'left', label: 'Izquierda' },
    { id: 'right', label: 'Derecha' }, { id: 'up', label: 'Espalda' },
  ] as const;

  readonly custom = computed(() => {
    const avatar = this.avatar();
    return avatar.mode === 'personalizado' ? avatar : null;
  });

  readonly visual = computed(() => {
    const bundle = this.bundle();
    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: this.avatar() }) : null;
  });

  /** Tarjetas del elenco, con o sin bata según el interruptor (cuadro 0 a ×2, spec §8.2). */
  readonly cast = computed(() => {
    const bundle = this.bundle();
    if (!bundle) return [];
    const variant = this.avatar().bata ? BATA_VARIANT : null;
    return PLAYABLE_IDS.map(id => ({
      id,
      label: bundle.recipes[id]?.displayName ?? id,
      visual: resolveCharacter(bundle, { kind: 'receta', recipeId: id, variant }),
    }));
  });

  readonly customVisual = computed(() => {
    const bundle = this.bundle();
    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: choosePersonalizado(this.avatar(), this.lastCustom()) }) : null;
  });

  readonly bataOptions = computed(() => {
    const bundle = this.bundle();
    return [false, true].map(bata => ({
      bata,
      label: bata ? 'Con bata' : 'Sin bata',
      visual: bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: withBata(this.avatar(), bata) }) : null,
    }));
  });

  readonly roleLabel = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role === 'PROFESOR' ? 'Docente' : role === 'ADMIN' ? 'Administrador' : 'Estudiante';
  });

  readonly characterLabel = computed(() => {
    const avatar = this.avatar();
    return avatar.mode === 'elenco' ? this.recipeLabel(avatar.recipeId) : 'Personalizado';
  });

  readonly summary = computed(() => avatarSummary(this.avatar(), id => this.recipeLabel(id)));

  constructor() {
    this.loadKit();
  }

  loadKit(): void {
    this.loadError.set(false);
    this.kit.load().catch(() => this.loadError.set(true));
  }

  isElenco(id: string): boolean {
    const avatar = this.avatar();
    return avatar.mode === 'elenco' && avatar.recipeId === id;
  }

  selectElenco(id: PlayableId): void {
    const custom = this.custom();
    if (custom) this.lastCustom.set(custom);
    this.store.set(chooseElenco(this.avatar(), id));
  }

  selectPersonalizado(): void {
    this.store.set(choosePersonalizado(this.avatar(), this.lastCustom()));
  }

  setCustom(patch: Partial<AvatarPersonalizado>): void {
    const custom = this.custom();
    if (custom) this.store.set(withCustom(custom, patch));
  }

  toggleAccessory(id: AccessoryId): void {
    const custom = this.custom();
    if (custom) this.store.set(toggleAccessory(custom, id));
  }

  setBata(bata: boolean): void {
    this.store.set(withBata(this.avatar(), bata));
  }

  /** Color base de la rampa (piel o pelo) para la muestra. */
  swatch(rampId: string): string {
    const ramp = this.bundle()?.ramps[rampId];
    return ramp ? ramp[1] : 'transparent';
  }

  private recipeLabel(id: string): string {
    return this.bundle()?.recipes[id]?.displayName ?? id;
  }

  guardar(): void {
    this.store.save();
    this.notify.success('Personaje guardado.');
  }

  restablecer(): void {
    this.store.reset();
  }

  continuar(): void {
    this.store.save();
    this.router.navigate(['/portal/simulador']);
  }
}
