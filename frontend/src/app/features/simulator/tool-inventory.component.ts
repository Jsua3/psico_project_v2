import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ClinicalToolState } from '../../core/models/simulation.model';

@Component({
  selector: 'app-tool-inventory',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="tool-hud" role="toolbar" aria-label="Inventario clínico de herramientas">
      @for (tool of tools(); track tool.code) {
        <button
          class="tool-btn"
          type="button"
          [class.tool-btn--owned]="inventory().includes(tool.code)"
          [class.tool-btn--locked]="!inventory().includes(tool.code)"
          [disabled]="!inventory().includes(tool.code)"
          [title]="tool.label + ' — ' + (inventory().includes(tool.code) ? 'Disponible' : 'No disponible')"
          [attr.aria-label]="tool.label + ': ' + tool.description + '. ' + (inventory().includes(tool.code) ? 'Disponible.' : 'No disponible.')"
          (click)="select.emit(tool.code)">
          <mat-icon aria-hidden="true">{{ tool.icon }}</mat-icon>
          <span class="tool-code" aria-hidden="true">{{ tool.code.slice(0, 4) }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    .tool-hud {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tool-btn {
      position: relative;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 1px solid rgba(79,163,165,.28);
      border-radius: 10px;
      background: rgba(8,12,18,.76);
      color: rgba(79,163,165,.55);
      cursor: pointer;
      padding: 0;
      transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
    }
    .tool-btn mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .tool-btn--owned {
      border-color: rgba(79,163,165,.5);
      color: #4fa3a5;
    }
    .tool-btn--owned:hover {
      border-color: rgba(79,163,165,.85);
      background: rgba(79,163,165,.14);
      box-shadow: 0 0 12px -4px rgba(79,163,165,.35);
    }
    .tool-btn--locked {
      opacity: .28;
      cursor: default;
    }
    .tool-code {
      position: absolute;
      bottom: 2px;
      right: 3px;
      font-size: .5rem;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 900;
      letter-spacing: .02em;
      opacity: .7;
      pointer-events: none;
    }
    :focus-visible {
      outline: 2px solid rgba(79,163,165,.7);
      outline-offset: 2px;
    }
  `]
})
export class ToolInventoryComponent {
  readonly tools = input<ClinicalToolState[]>([]);
  readonly inventory = input<string[]>([]);
  readonly select = output<string>();
}
