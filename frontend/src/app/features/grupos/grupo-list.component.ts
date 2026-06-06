import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { GrupoService, Grupo } from '../../core/api/grupo.service';
import { mapAgregarEstudianteError } from '../../core/api/grupo-error.utils';

@Component({
  selector: 'app-grupo-list',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatIconModule, MatProgressBarModule
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Grupos</h1>
    </div>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    @if (error()) {
      <p class="state-message state-message--error" role="alert">{{ error() }}</p>
    }

    <div class="layout">
      <!-- Formulario nuevo grupo -->
      <mat-card class="form-card">
        <mat-card-header><mat-card-title>Nuevo grupo</mat-card-title></mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="crear()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Nombre del grupo</mat-label>
              <input matInput formControlName="nombre">
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Código único</mat-label>
              <input matInput formControlName="codigo">
            </mat-form-field>
            <button class="psy-button psy-button--primary" type="submit" [disabled]="form.invalid || saving()">
              {{ saving() ? 'Creando…' : 'Crear grupo' }}
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Lista de grupos -->
      <mat-card class="table-card">
        <mat-card-content>
          @if (!loading() && !grupos().length) {
            <p class="empty-state">No hay grupos registrados.</p>
          } @else {
          <table mat-table [dataSource]="grupos()" class="full-width">
            <ng-container matColumnDef="nombre">
              <th mat-header-cell *matHeaderCellDef>Nombre</th>
              <td mat-cell *matCellDef="let g">{{ g.nombre }}</td>
            </ng-container>
            <ng-container matColumnDef="codigo">
              <th mat-header-cell *matHeaderCellDef>Código</th>
              <td mat-cell *matCellDef="let g"><code>{{ g.codigo }}</code></td>
            </ng-container>
            <ng-container matColumnDef="estudiantes">
              <th mat-header-cell *matHeaderCellDef>Estudiantes</th>
              <td mat-cell *matCellDef="let g">{{ g.totalEstudiantes }}</td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let g">
                <button mat-stroked-button type="button" (click)="agregarEstudiante(g.id)" aria-label="Agregar estudiante al grupo">
                  <mat-icon>person_add</mat-icon> Agregar
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
          }
        </mat-card-content>
      </mat-card>
    </div>

    <!-- Input agregar estudiante -->
    <div *ngIf="grupoSeleccionado()" class="agregar-estudiante">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Agregar estudiante al grupo</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="estudianteForm" (ngSubmit)="confirmarAgregar()">
            <mat-form-field appearance="outline">
              <mat-label>Email del estudiante</mat-label>
              <input matInput formControlName="email" type="email">
            </mat-form-field>
            <button class="psy-button psy-button--primary" type="submit" [disabled]="estudianteForm.invalid || agregandoEstudiante()">
              {{ agregandoEstudiante() ? 'Agregando…' : 'Agregar' }}
            </button>
            <button class="psy-button psy-button--ghost" type="button" (click)="grupoSeleccionado.set(null)">
              Cancelar
            </button>
          </form>
          @if (mensajeEstudiante()) {
            <p class="mensaje" [class.mensaje--error]="mensajeEsError()">{{ mensajeEstudiante() }}</p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page-header { display: flex; align-items: center; margin-bottom: 24px; }
    .page-title { font-size: clamp(1.8rem, 3vw, 2.5rem); font-weight: 800; color: var(--siep-blue); margin: 0; letter-spacing: 0; }
    .layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; }
    .full-width { width: 100%; }
    .agregar-estudiante { margin-top: 16px; }
    .agregar-estudiante form { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
    .state-message { margin: 0 0 12px; padding: 12px 14px; border-radius: 12px; color: #8f2f3d; background: rgba(143, 47, 61, .1); font-weight: 700; }
    .empty-state { margin: 16px 0; color: var(--psy-muted); font-weight: 700; }
    .mensaje { color: var(--psy-green-deep); font-size: .88rem; font-weight: 700; }
    .mensaje--error { color: #8f2f3d; }
    @media (max-width: 920px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 560px) {
      form .psy-button, .agregar-estudiante .psy-button { width: 100%; }
    }
  `]
})
export class GrupoListComponent implements OnInit {
  private grupoService = inject(GrupoService);
  private fb = inject(FormBuilder);

  grupos = signal<Grupo[]>([]);
  grupoSeleccionado = signal<number | null>(null);
  mensajeEstudiante = signal('');
  mensajeEsError = signal(false);
  loading = signal(true);
  saving = signal(false);
  agregandoEstudiante = signal(false);
  error = signal('');
  cols = ['nombre', 'codigo', 'estudiantes', 'acciones'];

  form = this.fb.group({ nombre: ['', Validators.required], codigo: ['', Validators.required] });
  estudianteForm = this.fb.group({ email: ['', [Validators.required, Validators.email]] });

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.error.set('');
    this.grupoService.listar().subscribe({
      next: g => {
        this.grupos.set(g);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar la información.');
        this.loading.set(false);
      }
    });
  }

  crear() {
    if (this.form.invalid || this.saving()) return;
    const { nombre, codigo } = this.form.value;
    this.saving.set(true);
    this.grupoService.crear(nombre!, codigo!).subscribe({
      next: g => {
        this.grupos.update(list => [...list, g]);
        this.form.reset();
        this.saving.set(false);
      },
      error: () => {
        this.error.set('No fue posible crear el grupo.');
        this.saving.set(false);
      }
    });
  }

  agregarEstudiante(id: number) {
    this.grupoSeleccionado.set(id);
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.estudianteForm.reset();
  }

  confirmarAgregar() {
    if (this.estudianteForm.invalid || this.agregandoEstudiante()) {
      if (this.estudianteForm.invalid) {
        this.estudianteForm.markAllAsTouched();
        this.mensajeEstudiante.set('Revisa el correo del estudiante.');
        this.mensajeEsError.set(true);
      }
      return;
    }
    const { email } = this.estudianteForm.value;
    this.agregandoEstudiante.set(true);
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.grupoService.agregarEstudiante(this.grupoSeleccionado()!, email!).subscribe({
      next: () => {
        this.mensajeEstudiante.set('Estudiante agregado correctamente.');
        this.mensajeEsError.set(false);
        this.estudianteForm.reset();
        this.agregandoEstudiante.set(false);
        this.cargar();
      },
      error: (err: HttpErrorResponse) => {
        this.mensajeEstudiante.set(mapAgregarEstudianteError(err));
        this.mensajeEsError.set(true);
        this.agregandoEstudiante.set(false);
      }
    });
  }
}
