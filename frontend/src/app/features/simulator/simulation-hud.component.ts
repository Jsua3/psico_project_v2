import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, Renderer2, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PatientState, SimulationAttemptState } from '../../core/models/simulation.model';
import { COARSE_POINTER_QUERY, matchesMedia, watchMedia } from './pointer-modality.util';
import { Heart, stressToHearts } from './stress-hearts.util';
import { StressTier, stressTier as resolveStressTier } from './stress-tier.util';

/** Marca de «ayuda vista» (la escribe la tarjeta de primera vez; aquí solo se borra desde Ajustes). */
const HELP_MEMORY_KEY = 'siep.ayuda.v1';

@Component({
  selector: 'app-simulation-hud',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    @if (attempt(); as game) {
      <div class="hud-shell"
        role="complementary"
        aria-label="Indicadores del simulador"
        [class.hud--stress-high]="stressTier() === 'high'"
        [class.hud--stress-critical]="stressTier() === 'critical'">

        <div class="hud-strip">
          <div class="hud-brand" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="brand-glyph" width="20" height="20">
              <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1.8 5.4A3 3 0 0 0 6 17a3 3 0 0 0 3 3V3z" fill="currentColor" opacity=".85"/>
              <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1.8 5.4A3 3 0 0 1 18 17a3 3 0 0 1-3 3V3z" fill="currentColor" opacity=".55"/>
              <circle cx="9" cy="9" r="1.1" fill="#0e1322"/>
              <circle cx="12" cy="13" r="1.1" fill="#0e1322"/>
              <circle cx="15" cy="9" r="1.1" fill="#0e1322"/>
            </svg>
            <span class="brand-word">SIEP</span>
          </div>

          <!-- Caso (solo con ancho de sobra) -->
          <div class="hud-zone hud-zone--case">
            <span class="hud-case" [title]="game.caseTitle">{{ game.caseTitle }}</span>
          </div>

          <!-- CENTRO: sala + contador único de decisión (lo calcula quien integra el HUD) -->
          <div class="hud-zone hud-zone--center">
            <div class="hud-scene">
              <mat-icon aria-hidden="true">location_on</mat-icon>
              <span>{{ locationLabel() || game.currentNode.title }}</span>
            </div>
            @if (stageLabel(); as stage) {
              <span class="hud-stage-chip">{{ stage }}</span>
            }
          </div>

          <!-- RIGHT: vitals + actions -->
          <div class="hud-zone hud-zone--right">
            <div class="hud-stress"
              [class.hud-stress--pulse]="stressPulse()"
              role="meter"
              [attr.aria-valuenow]="game.stressIndex" aria-valuemin="0" aria-valuemax="100"
              [attr.aria-label]="'Estado de estrés del caso: ' + game.stressIndex + '%. ' + stressLabel()">
              <span class="hud-metric-label">Estrés</span>
              <div class="hud-hearts-wrap" title="Estrés del caso: los corazones muestran la calma restante">
                <div class="hud-hearts" aria-hidden="true" [style.color]="stressColor()">
                  @for (h of hearts(); track $index) {
                    <span class="heart" [class.heart--half]="h === 'half'" [class.heart--full]="h === 'full'">
                      <svg viewBox="0 0 24 24" class="heart-svg">
                        <path class="heart-outline" d="M12 20.3l-1.5-1.35C5.2 14.2 2 11.3 2 7.7 2 5 4.1 3 6.8 3c1.6 0 3.1.7 4 1.9C11.7 3.7 13.2 3 14.8 3 17.5 3 19.6 5 19.6 7.7c0 3.6-3.2 6.5-8.5 11.25L12 20.3z"/>
                        <path class="heart-fill" d="M12 20.3l-1.5-1.35C5.2 14.2 2 11.3 2 7.7 2 5 4.1 3 6.8 3c1.6 0 3.1.7 4 1.9C11.7 3.7 13.2 3 14.8 3 17.5 3 19.6 5 19.6 7.7c0 3.6-3.2 6.5-8.5 11.25L12 20.3z"/>
                      </svg>
                    </span>
                  }
                </div>
                <span class="stress-pct" [style.color]="stressColor()" aria-hidden="true">{{ game.stressIndex }}%</span>
              </div>
            </div>

            @if (patientState(); as ps) {
              <div class="hud-patient" role="group" aria-label="Estado de la paciente">
                <div class="patient-bars">
                  <div class="patient-bar-row">
                    <span class="bar-label">Confianza</span>
                    <div class="mini-track" role="meter" [attr.aria-valuenow]="ps.trustLevel" aria-valuemin="0" aria-valuemax="100" aria-label="Confianza de la paciente">
                      <span [style.width.%]="ps.trustLevel" [style.background]="trustColor(ps.trustLevel)"></span>
                    </div>
                    <span class="bar-value">{{ ps.trustLevel }}%</span>
                  </div>
                  <div class="patient-bar-row">
                    <span class="bar-label">Bienestar</span>
                    <div class="mini-track" role="meter" [attr.aria-valuenow]="ps.emotionalState" aria-valuemin="0" aria-valuemax="100" aria-label="Bienestar emocional de la paciente">
                      <span [style.width.%]="ps.emotionalState" [style.background]="emotionColor(ps.emotionalState)"></span>
                    </div>
                    <span class="bar-value">{{ ps.emotionalState }}%</span>
                  </div>
                </div>
              </div>
            }

            <div class="hud-score" role="group" [attr.aria-label]="'Seguimiento formativo: ' + game.accumulatedScore + ' puntos'"
              [title]="progressLabel()">
              <mat-icon aria-hidden="true">fact_check</mat-icon>
              <strong>{{ game.accumulatedScore }}</strong>
            </div>

            <div class="hud-actions">
              <button type="button" class="hud-action" (click)="openHelp.emit()"
                aria-label="Abrir cómo se juega" title="Cómo se juega">
                <mat-icon aria-hidden="true">help</mat-icon>
              </button>
              <button type="button" class="hud-action" [class.hud-action--active]="journalOpen()"
                (click)="toggleJournal.emit()"
                [attr.aria-label]="coarsePointer() ? 'Abrir bitácora reflexiva' : 'Abrir bitácora reflexiva (J)'"
                [title]="coarsePointer() ? 'Bitácora' : 'Bitácora (J)'">
                <mat-icon aria-hidden="true">menu_book</mat-icon>
              </button>
              <button #settingsTrigger type="button" class="hud-action" [class.hud-action--active]="settingsOpen()"
                (click)="settingsOpen.set(!settingsOpen())"
                aria-label="Abrir ajustes del juego" title="Ajustes"
                [attr.aria-expanded]="settingsOpen()"
                [attr.aria-controls]="settingsOpen() ? 'game-settings-menu' : null">
                <mat-icon aria-hidden="true">settings</mat-icon>
              </button>
              @if (settingsOpen()) {
                <div #settingsMenu id="game-settings-menu" class="settings-menu" popover="manual"
                  [style.--hud-menu-top]="menuTop() + 'px'"
                  role="dialog" aria-modal="false" aria-labelledby="game-settings-title">
                  <div class="settings-menu__header">
                    <strong id="game-settings-title">Ajustes</strong>
                    <button type="button" aria-label="Cerrar ajustes" (click)="closeSettings()">
                      <mat-icon aria-hidden="true">close</mat-icon>
                    </button>
                  </div>
                  <button type="button" [attr.aria-pressed]="!musicMuted()" (click)="toggleMusic.emit()">
                    <mat-icon aria-hidden="true">{{ musicMuted() ? 'music_off' : 'music_note' }}</mat-icon>
                    <span>Música ambiental</span>
                    <strong>{{ musicMuted() ? 'Off' : 'On' }}</strong>
                  </button>
                  <button type="button" [attr.aria-pressed]="!sfxMuted()" (click)="toggleSfx.emit()">
                    <mat-icon aria-hidden="true">{{ sfxMuted() ? 'volume_off' : 'graphic_eq' }}</mat-icon>
                    <span>Sonidos de acciones</span>
                    <strong>{{ sfxMuted() ? 'Off' : 'On' }}</strong>
                  </button>
                  <button type="button" [attr.aria-pressed]="reduceMotion()" (click)="toggleReduceMotion.emit()">
                    <mat-icon aria-hidden="true">motion_photos_pause</mat-icon>
                    <span>Movimiento reducido</span>
                    <strong>{{ reduceMotion() ? 'On' : 'Off' }}</strong>
                  </button>
                  <button type="button" (click)="toggleJournal.emit(); settingsOpen.set(false)">
                    <mat-icon aria-hidden="true">menu_book</mat-icon>
                    <span>Bitácora</span>
                    <strong>{{ coarsePointer() ? '' : 'J' }}</strong>
                  </button>
                  <button type="button" (click)="showHelp()">
                    <mat-icon aria-hidden="true">help_outline</mat-icon>
                    <span>Cómo se juega</span>
                    <strong></strong>
                  </button>
                  <button type="button" (click)="resetHelpMemory()">
                    <mat-icon aria-hidden="true">replay</mat-icon>
                    <span>Ver la ayuda otra vez</span>
                    <strong>{{ helpResetDone() ? 'Lista' : '' }}</strong>
                  </button>
                  <span class="settings-menu__status" role="status">{{ helpResetDone() ? 'La ayuda de primera vez volverá a mostrarse.' : '' }}</span>
                  <a routerLink="/portal/simulador">
                    <mat-icon aria-hidden="true">home</mat-icon>
                    <span>Catálogo</span>
                    <strong></strong>
                  </a>
                </div>
              }
              <a class="hud-action hud-action--home" routerLink="/portal/simulador"
                aria-label="Volver al catálogo de simulaciones" title="Volver al catálogo">
                <mat-icon aria-hidden="true">home</mat-icon>
              </a>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .hud-shell {
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, rgba(22,18,42,.92), rgba(8,12,18,.9));
      border-bottom: 1px solid rgba(182,156,255,.2);
      box-shadow: inset 0 -1px 0 rgba(8,12,18,.9);
      color: rgba(232,240,244,.9);
      transition: border-color var(--psy-motion-ui);
    }
    .hud--stress-high  { border-color: rgba(212,160,80,.4); }
    .hud--stress-critical { border-color: rgba(168,80,98,.5); }

    .hud-strip {
      display: flex;
      align-items: center;
      gap: 14px;
      height: 48px;
      padding: 0 14px;
    }
    .hud-zone { display: flex; align-items: center; }
    .hud-zone--case { gap: 10px; min-width: 0; flex-shrink: 1; }
    /* overflow: hidden + min-width: 0 en la zona y en la sala: nada del centro se derrama sobre el
       caso ni sobre el estrés (HUD-10: entre 961 y 1200 px se encimaban y la sala quedaba en 0 px). */
    .hud-zone--center { flex: 1; min-width: 0; overflow: hidden; gap: 10px; justify-content: center; }
    .hud-zone--right { flex-shrink: 0; gap: 12px; margin-left: auto; }

    .hud-brand { display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding-right: 10px; border-right: 1px solid rgba(182,156,255,.18); }
    .brand-glyph { color: #B69CFF; flex-shrink: 0; }
    .brand-word { font-family: 'Poppins', system-ui, sans-serif; font-weight: 900; font-size: .82rem; letter-spacing: .12em; color: #E7DDFF; }

    .hud-case {
      max-width: clamp(160px, 20vw, 320px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 800;
      font-size: .84rem;
      color: rgba(244,247,251,.92);
    }
    .hud-stage-chip {
      flex: 0 0 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid rgba(182,156,255,.3);
      background: rgba(124,77,255,.14);
      font-size: .75rem;
      font-weight: 800;
      color: #cdbcff;
      white-space: nowrap;
    }

    .hud-score { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
    .hud-score mat-icon { color: #B69CFF; font-size: 18px; width: 18px; height: 18px; }
    .hud-score strong { font-family: 'JetBrains Mono', monospace; font-size: .9rem; letter-spacing: .04em; }

    .hud-stress { display: flex; align-items: center; gap: 7px; flex: 0 0 auto; }
    .hud-stress--pulse { animation: stress-pulse .6s ease-out; }
    .hud-metric-label,
    .bar-label {
      color: rgba(232,240,244,.68);
      font-size: .75rem;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .hud-hearts-wrap { display: flex; align-items: center; gap: 6px; }
    .hud-hearts { display: inline-flex; align-items: center; gap: 2px; }
    .heart { display: inline-block; width: 15px; height: 15px; line-height: 0; }
    .heart-svg { width: 15px; height: 15px; display: block; }
    .heart-outline { fill: none; stroke: currentColor; stroke-width: 1.7; opacity: .6; }
    .heart-fill { fill: currentColor; clip-path: inset(0 100% 0 0); }
    .heart--half .heart-fill { clip-path: inset(0 50% 0 0); }
    .heart--full .heart-fill { clip-path: inset(0 0 0 0); }
    .heart--full .heart-outline { opacity: 1; }
    .stress-pct { font-family: 'JetBrains Mono', monospace; font-size: .78rem; min-width: 38px; transition: color var(--psy-motion-ui); }

    .hud-patient { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .patient-bars { display: flex; flex-direction: column; gap: 3px; }
    .patient-bar-row { display: grid; grid-template-columns: 68px 56px 34px; align-items: center; gap: 5px; }
    .bar-label { font-size: .75rem; text-transform: none; letter-spacing: 0; }
    .bar-value { color: rgba(232,240,244,.58); font-family: 'JetBrains Mono', monospace; font-size: .75rem; text-align: right; }
    .mini-track { width: 56px; height: 5px; border-radius: 999px; background: rgba(255,255,255,.1); overflow: hidden; }
    .mini-track span { display: block; height: 100%; border-radius: inherit; transition: width .5s ease, background .5s ease; }

    .hud-scene { display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; }
    .hud-scene mat-icon { color: #B69CFF; font-size: 15px; width: 15px; height: 15px; flex-shrink: 0; }
    .hud-scene span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8rem; color: rgba(232,240,244,.7); }

    .hud-actions {
      position: relative;
      display: flex;
      align-items: center;
      gap: 6px;
      padding-left: 12px;
      border-left: 1px solid rgba(182,156,255,.16);
    }
    .hud-action {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border: 1px solid rgba(182,156,255,.28);
      border-radius: 9px;
      background: rgba(8,12,18,.5);
      color: rgba(182,156,255,.65);
      cursor: pointer;
      text-decoration: none;
      transition: border-color 160ms, color 160ms, background 160ms;
    }
    .hud-action:hover { border-color: rgba(182,156,255,.6); color: #B69CFF; background: rgba(124,77,255,.1); }
    .hud-action:focus-visible {
      outline: 2px solid rgba(182,156,255,.7);
      outline-offset: 2px;
    }
    .hud-action:active { transform: translateY(1px); }
    .hud-action--active { border-color: rgba(182,156,255,.8); color: #B69CFF; background: rgba(124,77,255,.18); }
    .hud-action mat-icon { font-size: 18px; width: 18px; height: 18px; }
    /* popover="manual": el menú vive en la capa superior del navegador, por encima de los controles
       táctiles del mundo (z 48), que si no lo tapaban. Sin soporte de popover se ve igual, fijo y con z-index. */
    .settings-menu {
      position: fixed;
      inset: auto 8px auto auto;
      top: var(--hud-menu-top, 53px);
      margin: 0;
      z-index: 80;
      width: min(280px, calc(100vw - 24px));
      /* Con las filas de ayuda el menú ya no cabe en un móvil horizontal: se desplaza dentro de sí mismo. */
      max-height: calc(100vh - var(--hud-menu-top, 53px) - 12px);
      max-height: calc(100dvh - var(--hud-menu-top, 53px) - 12px);
      overflow-y: auto;
      overscroll-behavior: contain;
      display: grid;
      gap: 6px;
      padding: 10px;
      border: 1px solid rgba(182,156,255,.32);
      border-radius: 12px;
      background: rgb(13,18,30);
      box-shadow: 0 18px 50px -28px rgba(124,77,255,.8);
    }
    /* Fija arriba: en un móvil horizontal el menú se desplaza y el «x» no debe perderse de vista. */
    .settings-menu__header {
      position: sticky;
      top: -10px;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: -10px -10px 0;
      padding: 10px 12px 6px;
      border-radius: 12px 12px 0 0;
      background: rgb(13,18,30);
      border-bottom: 1px solid rgba(182,156,255,.16);
      color: #e7ddff;
      font-size: .78rem;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .settings-menu__header button,
    .settings-menu button,
    .settings-menu a {
      color: inherit;
      font: inherit;
    }
    .settings-menu__header button {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: rgba(232,240,244,.7);
      cursor: pointer;
    }
    .settings-menu__header button:hover { background: rgba(255,255,255,.08); color: #fff; }
    .settings-menu > button,
    .settings-menu > a {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) 34px;
      align-items: center;
      gap: 9px;
      min-height: 38px;
      padding: 7px 8px;
      border: 1px solid rgba(182,156,255,.14);
      border-radius: 9px;
      background: rgba(255,255,255,.045);
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }
    .settings-menu > button:hover,
    .settings-menu > a:hover {
      border-color: rgba(182,156,255,.38);
      background: rgba(124,77,255,.12);
    }
    .settings-menu mat-icon { color: #B69CFF; font-size: 18px; width: 18px; height: 18px; }
    .settings-menu span {
      min-width: 0;
      color: rgba(232,240,244,.84);
      font-size: .78rem;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .settings-menu button strong,
    .settings-menu a strong {
      color: rgba(232,240,244,.55);
      font-family: 'JetBrains Mono', monospace;
      font-size: .75rem;
      text-align: right;
    }
    /* Región viva del menú: anuncia el reinicio de la ayuda sin ocupar sitio. */
    .settings-menu .settings-menu__status {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }

    @keyframes stress-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(212,160,80,.4); }
      70%  { box-shadow: 0 0 0 6px rgba(212,160,80,0); }
      100% { box-shadow: none; }
    }

    /* Sin ancho de sobra primero se va el nombre del caso; después la sala y las barras de la paciente.
       El chip «Decisión k de 6» se queda siempre: es el único contador. */
    @media (max-width: 1359px) {
      .hud-zone--case { display: none; }
    }
    @media (max-width: 960px) {
      .hud-scene { display: none; }
      .hud-patient { display: none; }
      /* Sin sala que ceda, el chip puede acortarse antes que recortarse. */
      .hud-stage-chip { flex-shrink: 1; }
    }
    @media (max-width: 720px) {
      .hud-strip { gap: 4px; min-width: 0; padding: 0 6px; }
      .hud-zone--right { min-width: 0; gap: 6px; }
      .hud-brand { display: none; }
      .hud-metric-label,
      .hud-hearts { display: none; }
      .stress-pct { min-width: 0; }
      .hud-actions { min-width: 0; gap: 4px; padding-left: 6px; }
    }
    /* Teléfono en vertical: el catálogo sigue a un toque en Ajustes («Catálogo»). */
    @media (max-width: 480px) {
      .hud-action--home { display: none; }
    }
    /* Pantallas mínimas (320 px): el contador manda sobre el puntaje. */
    @media (max-width: 380px) {
      .hud-score { display: none; }
    }
    /* Modo compacto (mismo criterio que el resto del simulador): cabecera de 44 px. */
    @media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {
      .hud-strip { height: 44px; }
      /* Ajustes en dos columnas: las siete filas caben en 390 px de alto sin desplazarse. */
      .settings-menu { grid-template-columns: repeat(2, minmax(0, 1fr)); width: min(560px, calc(100vw - 16px)); }
      .settings-menu__header { grid-column: 1 / -1; }
    }
    /* Objetivos táctiles de 44 px donde hay dedo (HUD-17): cabecera y menú de Ajustes. */
    @media (pointer: coarse) {
      .hud-action { width: 44px; height: 44px; }
      .hud-action mat-icon { font-size: 22px; width: 22px; height: 22px; }
      .settings-menu__header button { width: 44px; height: 44px; }
      .settings-menu > button,
      .settings-menu > a { min-height: 44px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .hud-stress--pulse { animation: none; }
      .hud-action:active { transform: none; }
    }
  `]
})
export class SimulationHudComponent {
  readonly attempt = input<SimulationAttemptState | null>(null);
  readonly stressPulse = input(false);
  /** Sin uso desde que el HUD no pinta el «paso» de la proximidad; se conserva para no romper el enlace de quien integra el HUD, que puede quitarlo. */
  readonly nearbyInteractionKey = input<string | null>(null);
  readonly patientState = input<PatientState | null>(null);
  /** Contador único del chip central («Decisión k de 6»); lo calcula quien integra el HUD. Sin valor, no hay chip. */
  readonly stageLabel = input<string | null>(null);
  readonly progressLabel = input('');
  /** Sala física actual (world.map.title); con puertas puede diferir del nodo DAG. */
  readonly locationLabel = input('');
  readonly journalOpen = input(false);
  readonly musicMuted = input(false);
  readonly sfxMuted = input(false);
  readonly reduceMotion = input(false);
  readonly settingsOpen = signal(false);
  /** Sin teclado de por medio: los nombres accesibles y textos de este HUD no prometen atajos (J). */
  readonly coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY));
  /** Tras «Ver la ayuda otra vez»: lo confirma la fila y una región viva (sin temporizadores). */
  readonly helpResetDone = signal(false);
  readonly toggleJournal = output<void>();
  /** Botón «?» de la cabecera y fila «Cómo se juega» de Ajustes: piden abrir la pantalla de ayuda. */
  readonly openHelp = output<void>();
  /** «Ver la ayuda otra vez» ya borró la marca de ayuda vista: quien integra puede volver a mostrar la tarjeta de primera vez. */
  readonly helpReset = output<void>();
  readonly toggleMusic = output<void>();
  readonly toggleSfx = output<void>();
  readonly toggleReduceMotion = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly settingsTrigger = viewChild<ElementRef<HTMLButtonElement>>('settingsTrigger');
  private readonly settingsMenu = viewChild<ElementRef<HTMLElement>>('settingsMenu');
  /** Borde superior del menú (px): justo bajo la cabecera, medido al abrirlo porque su alto cambia en compacto. */
  readonly menuTop = signal(53);
  private stopPointerListener: (() => void) | null = null;

  constructor() {
    // El oyente de clic fuera existe solo mientras Ajustes está abierto: uno global y
    // permanente hace entrar en la zona de Angular cada toque de toda la pantalla de juego.
    effect(() => {
      if (this.settingsOpen()) this.listenOutsidePointer();
      else this.unlistenOutsidePointer();
    });
    // El menú se abre en la capa superior (popover) cuando el navegador la ofrece.
    effect(() => {
      const menu = this.settingsMenu()?.nativeElement;
      if (!menu) return;
      this.menuTop.set(Math.round(this.host.nativeElement.getBoundingClientRect().bottom) + 9);
      try {
        menu.showPopover?.();
      } catch {
        // Ya estaba abierto o el navegador no admite popover: se queda como menú fijo normal.
      }
    });
    // Un híbrido puede cambiar de puntero principal; la consulta avisa sin escuchar nada de `document`.
    const stopWatchingPointer = watchMedia(COARSE_POINTER_QUERY, coarse => this.coarsePointer.set(coarse));
    inject(DestroyRef).onDestroy(() => {
      this.unlistenOutsidePointer();
      stopWatchingPointer();
    });
  }

  /** Cierra Ajustes; por defecto devuelve el foco al engranaje (el botón «x» desaparece). */
  closeSettings(restoreFocus = true): void {
    if (!this.settingsOpen()) return;
    this.settingsOpen.set(false);
    this.helpResetDone.set(false);
    if (restoreFocus) this.settingsTrigger()?.nativeElement.focus();
  }

  /** Fila «Cómo se juega»: cierra Ajustes sin devolver el foco al engranaje (lo toma la ayuda) y pide abrirla. */
  showHelp(): void {
    this.closeSettings(false);
    this.openHelp.emit();
  }

  /** Fila «Ver la ayuda otra vez»: olvida que la ayuda de primera vez ya se vio. Solo borra una marca del navegador. */
  resetHelpMemory(): void {
    try {
      localStorage.removeItem(HELP_MEMORY_KEY);
    } catch {
      // Almacenamiento bloqueado (modo privado): entonces la marca no se guardaba y no hay nada que borrar.
    }
    this.helpResetDone.set(true);
    this.helpReset.emit();
  }

  /** `document` recibe la tecla antes que el `window:keydown` de la partida. Consumirla
   *  evita que ese manejador la tome como «salida segura» y pause el intento. Con el filtro
   *  `.escape` el plugin de teclas de Angular escucha fuera de la zona y solo entra en ella
   *  cuando la tecla coincide (caminando llegan ~30 keydown por segundo). */
  @HostListener('document:keydown.escape', ['$event'])
  onDocumentKeydown(event: Event): void {
    if (event.defaultPrevented || !this.settingsOpen()) return;
    event.preventDefault();
    this.closeSettings();
  }

  /** Un toque o clic fuera del HUD cierra el menú sin robar el foco. */
  private onDocumentPointerDown(event: Event): void {
    if (!this.settingsOpen()) return;
    if (this.host.nativeElement.contains(event.target as Node | null)) return;
    this.closeSettings(false);
  }

  private listenOutsidePointer(): void {
    this.stopPointerListener ??= this.renderer.listen('document', 'pointerdown',
      (event: Event) => this.onDocumentPointerDown(event));
  }

  private unlistenOutsidePointer(): void {
    this.stopPointerListener?.();
    this.stopPointerListener = null;
  }

  /** Tramos de estrés de `stress-tier.util` (umbrales únicos de toda la partida). */
  readonly stressTier = computed<StressTier>(() => resolveStressTier(this.attempt()?.stressIndex));

  readonly hearts = computed<Heart[]>(() => stressToHearts(this.attempt()?.stressIndex ?? 0));

  readonly stressColor = computed(() => ({
    calm:     '#6EC67A',
    moderate: '#F5B84B',
    high:     '#F08C4B',
    critical: '#E25A4F'
  })[this.stressTier()]);

  readonly stressLabel = computed(() => ({
    calm:     'Situación estable',
    moderate: 'Tensión moderada',
    high:     'Estrés elevado — considere herramientas de contención',
    critical: 'Nivel crítico — priorice seguridad y autocuidado'
  })[this.stressTier()]);

  trustColor(v: number): string {
    if (v >= 60) return '#4fa3a5';
    if (v >= 30) return '#c4c84a';
    return '#e06070';
  }

  emotionColor(v: number): string {
    if (v >= 60) return '#4fa3a5';
    if (v >= 30) return '#d4943a';
    return '#e06070';
  }
}
