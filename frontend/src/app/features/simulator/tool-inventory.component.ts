import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ClinicalToolState } from '../../core/models/simulation.model';

@Component({
  selector: 'app-tool-inventory',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="tool-dock" role="toolbar" aria-label="Herramientas psicopedagógicas">
      @for (tool of tools(); track tool.code; let i = $index) {
        <button
          class="tool-card"
          type="button"
          [class.tool-card--owned]="inventory().includes(tool.code)"
          [class.tool-card--locked]="!inventory().includes(tool.code)"
          [class.tool-card--active]="tool.code === selectedToolCode()"
          [disabled]="!inventory().includes(tool.code)"
          [attr.aria-label]="tool.label + ': ' + tool.description + '. ' + (inventory().includes(tool.code) ? 'Disponible.' : 'No disponible.')"
          (click)="onSelect(tool)">
          <span class="tool-key" aria-hidden="true">{{ i + 1 }}</span>
          <mat-icon class="tool-icon" aria-hidden="true">{{ tool.icon }}</mat-icon>
          <span class="tool-label">{{ tool.label }}</span>
          <span class="tool-desc" [title]="tool.description">{{ tool.description }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    .tool-dock {
      display: flex;
      flex-direction: row;
      gap: 6px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      align-items: stretch;
      scrollbar-width: thin;
      scrollbar-color: rgba(124,77,255,.3) transparent;
      height: 100%;
      padding: 2px 0;
    }
    .tool-card {
      scroll-snap-align: start;
      flex: 0 0 auto;
      display: grid;
      grid-template-rows: auto 1fr auto;
      grid-template-columns: auto 1fr;
      column-gap: 8px;
      row-gap: 2px;
      min-width: 96px;
      max-width: 136px;
      padding: 7px 10px 7px 8px;
      border: 1px solid rgba(182,156,255,.26);
      border-radius: 10px;
      background: rgba(8,12,18,.76);
      color: rgba(182,156,255,.55);
      cursor: pointer;
      text-align: left;
      position: relative;
      transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
      font-family: inherit;
    }
    .tool-key {
      position: absolute;
      top: 3px;
      right: 5px;
      font-size: .56rem;
      font-weight: 900;
      color: rgba(182,156,255,.4);
      font-family: 'JetBrains Mono', monospace;
    }
    .tool-icon {
      grid-row: 1 / 3;
      grid-column: 1;
      font-size: 22px !important;
      width: 22px !important;
      height: 22px !important;
      align-self: center;
      color: #B69CFF;
      transition: color 140ms;
    }
    .tool-label {
      grid-column: 2;
      grid-row: 1;
      font-size: .7rem;
      font-weight: 800;
      color: rgba(232,240,244,.82);
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tool-desc {
      grid-column: 1 / 3;
      grid-row: 3;
      font-size: .6rem;
      color: rgba(232,240,244,.38);
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tool-card--owned {
      border-color: rgba(182,156,255,.5);
      color: #B69CFF;
    }
    .tool-card--owned:hover {
      border-color: rgba(182,156,255,.85);
      background: rgba(124,77,255,.16);
      box-shadow: 0 0 12px -4px rgba(124,77,255,.45);
    }
    .tool-card--active {
      border-color: rgba(124,77,255,.85) !important;
      background: rgba(124,77,255,.22) !important;
      box-shadow: 0 0 14px -4px rgba(124,77,255,.55) !important;
    }
    .tool-card--locked {
      opacity: .22;
      cursor: not-allowed;
    }
    .tool-card:focus-visible {
      outline: 2px solid rgba(182,156,255,.7);
      outline-offset: 2px;
    }
  `]
})
export class ToolInventoryComponent {
  readonly tools            = input<ClinicalToolState[]>([]);
  readonly inventory        = input<string[]>([]);
  readonly selectedToolCode  = input<string | null>(null);
  readonly select           = output<string>();

  onSelect(tool: ClinicalToolState): void {
    if (this.inventory().includes(tool.code)) {
      this.select.emit(tool.code);
    }
  }
}
