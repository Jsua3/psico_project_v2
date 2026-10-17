import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, ViewChild, afterNextRender, computed, inject, signal,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { GrupoService, Grupo, GrupoEstudiante, GrupoImportError, GrupoImportResult, GrupoImportSpec, MembershipStatus } from '../../core/api/grupo.service';
import { mapAgregarEstudianteError } from '../../core/api/grupo-error.utils';
import { SimulationService } from '../../core/api/simulation.service';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { apiErrorMessage } from '../../core/api/api-error.util';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { membershipLabel } from '../../shared/ui/labels';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiConfirmOptions, UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiStat } from '../../shared/ui/stat/ui-stat';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { GroupAssignmentsComponent } from './group-assignments.component';

/** E2-10: un servidor anterior no mandaba `membershipStatus` (todas eran membresías activas). */
function membershipOf(student: GrupoEstudiante): MembershipStatus {
  return student.membershipStatus ?? 'ACTIVE';
}

/** De quien no aceptó, el servidor solo devuelve el correo (D-14): ese es su nombre en pantalla. */
function studentName(student: GrupoEstudiante): string {
  const name = `${student.nombre ?? ''} ${student.apellido ?? ''}`.trim();
  return name || student.email;
}

const MEMBERSHIP_TONES: Record<MembershipStatus, UiBadgeTone> = {
  ACTIVE: 'success', INVITED: 'info', DECLINED: 'neutral', REMOVED: 'neutral',
};

function membershipBadge(student: GrupoEstudiante): { label: string; tone: UiBadgeTone } {
  const status = membershipOf(student);
  return { label: membershipLabel(status), tone: MEMBERSHIP_TONES[status] ?? 'neutral' };
}

/** A un invitado se le cancela la invitación; a un miembro se le quita del grupo. */
function removeLabel(student: GrupoEstudiante): string {
  return membershipOf(student) === 'INVITED'
    ? `Cancelar la invitación a ${student.email}`
    : `Quitar a ${studentName(student)} del grupo`;
}

/**
 * Pantalla Grupos (plan visual F7-2): una cabecera, la tabla de grupos con UN menú de acciones por fila (antes cinco
 * botones de texto en cada tarjeta), esqueleto y error dentro de la tabla, ninguna cifra mientras carga, y el detalle
 * del grupo con la zona de importación (arrastrar o elegir el .xlsx). Los diálogos y los campos son los de la
 * biblioteca (`UiDialog`, `ui-field`).
 */
@Component({
  selector: 'app-grupo-list',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink,
    UiBadge, UiButton, UiIconButton, UiCard, UiControl, UiField, UiMenu, UiPageHeader, UiSection, UiStat,
    UiEmptyState, UiErrorState, UiTable, UiTableRow, UiTableTable, GroupAssignmentsComponent,
  ],
  templateUrl: './grupo-list.component.html',
  styleUrl: './grupo-list.component.scss',
  // Eager: los errores de los campos salen de `control.touched`, que no es una señal; cada evento de la plantilla
  // vuelve a evaluarla.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GrupoListComponent implements OnInit {
  @ViewChild('importFileInput') importFileInput?: ElementRef<HTMLInputElement>;
  // Esta pantalla tiene tres formularios: el del grupo se referencia por variable de plantilla,
  // no por `@ViewChild(FormGroupDirective)`, que devolvería el primero que encuentre.
  @ViewChild('groupForm') private groupFormEl?: ElementRef<HTMLFormElement>;
  @ViewChild('groupFormDir') private groupFormDir?: FormGroupDirective;

  private grupoService = inject(GrupoService);
  private simulationService = inject(SimulationService);
  private fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(UiDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  grupos = signal<Grupo[]>([]);
  grupoActivo = signal<Grupo | null>(null);
  grupoSeleccionado = signal<number | null>(null);
  editandoGrupo = signal<Grupo | null>(null);
  estudiantes = signal<GrupoEstudiante[]>([]);
  busquedaGrupo = signal('');
  busquedaEstudiante = signal('');
  casosDisponibles = signal<SimulationCaseSummary[]>([]);
  /** Los casos publicados ya respondieron (una cifra de 0 solo es verdad después de que respondan). */
  casosCargados = signal(false);
  /** Cuántos casos tiene asignados el grupo abierto: lo dice la sección de asignaciones (F10-5) y lo cuenta el encabezado. */
  casosAsignadosTotal = signal(0);
  mensajeEstudiante = signal('');
  importSpec = signal<GrupoImportSpec | null>(null);
  archivoImportacion = signal<File | null>(null);
  resultadoImportacion = signal<GrupoImportResult | null>(null);
  erroresImportacion = signal<GrupoImportError[]>([]);
  mensajeEsError = signal(false);
  loading = signal(true);
  detailLoading = signal(false);
  saving = signal(false);
  agregandoEstudiante = signal(false);
  importandoEstudiantes = signal(false);
  error = signal('');
  /** Hay un archivo sobre la zona de importación (se resalta mientras dure). */
  arrastrando = signal(false);

  totalEstudiantes = computed(() =>
    this.grupos().reduce((total, grupo) => total + grupo.totalEstudiantes, 0)
  );
  /** E2-10: invitaciones que los estudiantes aún no responden (no son miembros todavía). */
  totalInvitados = computed(() =>
    this.grupos().reduce((total, grupo) => total + (grupo.totalInvitados ?? 0), 0)
  );
  /** Del grupo abierto: quienes aceptaron (miembros) y quienes tienen la invitación pendiente. */
  protected readonly miembros = computed(() => this.estudiantes().filter(student => membershipOf(student) === 'ACTIVE'));
  protected readonly invitados = computed(() => this.estudiantes().filter(student => membershipOf(student) === 'INVITED'));
  protected readonly detalleConteo = computed(() => {
    const miembros = this.miembros().length;
    const invitados = this.invitados().length;
    const partes = [`${miembros} ${miembros === 1 ? 'estudiante' : 'estudiantes'}`];
    if (invitados) partes.push(`${invitados} ${invitados === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}`);
    const casos = this.casosAsignadosTotal();
    partes.push(`${casos} ${casos === 1 ? 'caso asignado' : 'casos asignados'}`);
    return partes.join(' · ');
  });
  protected readonly membershipBadge = membershipBadge;
  protected readonly studentName = studentName;
  protected readonly removeLabel = removeLabel;
  protected readonly canRemove = (student: GrupoEstudiante) => ['ACTIVE', 'INVITED'].includes(membershipOf(student));
  gruposFiltrados = computed(() => {
    const query = this.busquedaGrupo().trim().toLowerCase();
    if (!query) return this.grupos();
    return this.grupos().filter(grupo =>
      `${grupo.nombre} ${grupo.codigo}`.toLowerCase().includes(query)
    );
  });
  estudiantesFiltrados = computed(() => {
    const query = this.busquedaEstudiante().trim().toLowerCase();
    if (!query) return this.estudiantes();
    return this.estudiantes().filter(student =>
      `${student.nombre} ${student.apellido} ${student.email}`.toLowerCase().includes(query)
    );
  });

  /** Estado de la lista de grupos (esqueleto, error, primer uso o listo): una sola señal, de a uno. */
  readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.grupos().length === 0),
  });
  /**
   * Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia): la carga de la lista y
   * el resultado de las acciones del detalle (importar, agregar, quitar).
   */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? 'Cargando grupos…' : this.mensajeEstudiante()));

  /** Acciones del menú de cada fila (lo que no es «Ver detalle» ni «Ver reporte»). */
  protected readonly rowActions: UiMenuItem[] = [
    { value: 'agregar', label: 'Invitar estudiante', icon: 'person_add' },
    { value: 'copiar', label: 'Copiar código', icon: 'content_copy' },
    { value: 'editar', label: 'Editar', icon: 'edit' },
    { value: 'borrar', label: 'Borrar', icon: 'delete', tone: 'danger' },
  ];

  form = this.fb.group({ nombre: ['', Validators.required], codigo: ['', Validators.required] });
  estudianteForm = this.fb.group({ email: ['', [Validators.required, Validators.email]] });

  ngOnInit() {
    this.cargar();
    this.grupoService.importSpec().subscribe({
      next: spec => this.importSpec.set(spec),
      error: () => this.importSpec.set({
        requiredColumns: ['nombre', 'apellido', 'email'],
        optionalColumns: [],
        columns: ['nombre', 'apellido', 'email'],
        templateFilename: 'plantilla_importacion_estudiantes_siep.xlsx',
        acceptedExtensions: ['.xlsx']
      })
    });
    this.simulationService.listCases().subscribe({
      next: cases => {
        this.casosDisponibles.set(cases);
        this.casosCargados.set(true);
      },
      error: () => this.casosDisponibles.set([])
    });
  }

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, message: string): string | null {
    return control.touched && control.invalid ? message : null;
  }

  /**
   * Carga los grupos. Con `silencioso` (tras agregar un estudiante) no vuelve a mostrar el esqueleto: la lista sigue
   * a la vista y solo cambian sus cifras.
   */
  cargar(silencioso = false) {
    if (!silencioso) this.loading.set(true);
    this.error.set('');
    this.grupoService.listar().subscribe({
      next: g => {
        this.grupos.set(g);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        // Un refresco silencioso que falla no tira una lista válida: se conserva y se avisa.
        if (silencioso) {
          this.notify.warning('No pudimos actualizar la lista de grupos.');
          return;
        }
        this.error.set('No fue posible cargar la información.');
      }
    });
  }

  limpiarBusqueda() {
    this.busquedaGrupo.set('');
  }

  /**
   * Reinicia valores Y el estado «enviado» del formulario del grupo: se usa la directiva de ESE formulario, no la de
   * los otros dos de la pantalla.
   */
  private resetGroupForm(value?: { nombre: string | null; codigo: string | null }): void {
    if (this.groupFormDir) this.groupFormDir.resetForm(value);
    else this.form.reset(value);
  }

  /** true (y marca y enfoca) si el formulario del grupo tiene errores. */
  private invalidGroupForm(): boolean {
    if (!this.form.invalid) return false;
    this.form.markAllAsTouched();
    // El formulario de casos nace inválido: se busca solo dentro del formulario del grupo.
    focusFirstInvalid(this.groupFormEl?.nativeElement ?? this.host.nativeElement);
    return true;
  }

  crear() {
    if (this.saving() || this.invalidGroupForm()) return;
    const { nombre, codigo } = this.form.value;
    this.saving.set(true);
    this.grupoService.crear(nombre!, codigo!).subscribe({
      next: g => {
        this.grupos.update(list => [...list, g]);
        this.resetGroupForm();
        this.saving.set(false);
        this.notify.success('Grupo creado.');
      },
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible crear el grupo.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      }
    });
  }

  editarGrupo(grupo: Grupo) {
    this.editandoGrupo.set(grupo);
    this.resetGroupForm({ nombre: grupo.nombre, codigo: grupo.codigo });
    this.error.set('');
  }

  cancelarEdicion() {
    this.editandoGrupo.set(null);
    this.resetGroupForm();
  }

  actualizarGrupo() {
    const grupo = this.editandoGrupo();
    if (!grupo || this.saving() || this.invalidGroupForm()) return;
    const { nombre, codigo } = this.form.value;
    this.saving.set(true);
    this.error.set('');
    this.grupoService.actualizar(grupo.id, { nombre: nombre!, codigo: codigo! }).subscribe({
      next: actualizado => {
        this.grupos.update(list => list.map(g => g.id === actualizado.id ? actualizado : g));
        if (this.grupoActivo()?.id === actualizado.id) this.grupoActivo.set(actualizado);
        this.cancelarEdicion();
        this.saving.set(false);
        this.notify.success('Grupo actualizado.');
      },
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible actualizar el grupo.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      }
    });
  }

  /** Lo que se elige en el menú de la fila de un grupo. */
  accionDeFila(grupo: Grupo, accion: string | undefined): void {
    switch (accion) {
      case 'agregar': this.agregarEstudiante(grupo); break;
      case 'copiar': this.copiarCodigo(grupo); break;
      case 'editar': this.editarGrupo(grupo); break;
      case 'borrar': void this.eliminarGrupo(grupo); break;
    }
  }

  /** true mientras hay un diálogo de confirmación abierto: un segundo gesto no abre otro ni repite la acción. */
  private confirmando = false;

  private async confirmar(options: UiConfirmOptions): Promise<boolean> {
    if (this.confirmando) return false;
    this.confirmando = true;
    try {
      return await this.dialog.confirm(options);
    } finally {
      this.confirmando = false;
    }
  }

  async eliminarGrupo(grupo: Grupo): Promise<void> {
    const confirmado = await this.confirmar({
      title: 'Borrar grupo',
      message: `¿Borrar el grupo "${grupo.nombre}"? Se quitarán sus estudiantes y casos asignados. Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar',
      tone: 'danger',
    });
    if (confirmado) this.borrarGrupo(grupo);
  }

  private borrarGrupo(grupo: Grupo) {
    this.error.set('');
    this.grupoService.eliminar(grupo.id).subscribe({
      next: () => {
        this.grupos.update(list => list.filter(g => g.id !== grupo.id));
        if (this.grupoActivo()?.id === grupo.id) this.grupoActivo.set(null);
        if (this.editandoGrupo()?.id === grupo.id) this.cancelarEdicion();
        this.notify.success('Grupo eliminado.');
      },
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible borrar el grupo.');
        if (text) this.notify.error(text);
      }
    });
  }

  async quitarEstudiante(grupo: Grupo, student: GrupoEstudiante): Promise<void> {
    const confirmado = await this.confirmar({
      // E2-10: a un invitado no se le quita: se le cancela la invitación (y de él solo se conoce el correo).
      ...(membershipOf(student) === 'INVITED'
        ? { title: 'Cancelar invitación', message: `¿Cancelar la invitación a ${student.email}?`, confirmLabel: 'Cancelar invitación' }
        : { title: 'Quitar estudiante', message: `¿Quitar a ${studentName(student)} del grupo?`, confirmLabel: 'Quitar' }),
    });
    if (confirmado) this.retirarEstudiante(grupo, student);
  }

  private retirarEstudiante(grupo: Grupo, student: GrupoEstudiante) {
    this.grupoService.quitarEstudiante(grupo.id, student.id).subscribe({
      next: actualizado => {
        this.estudiantes.update(list => list.filter(s => s.id !== student.id));
        this.grupos.update(list => list.map(g => g.id === actualizado.id ? actualizado : g));
        if (this.grupoActivo()?.id === actualizado.id) this.grupoActivo.set(actualizado);
        this.notify.success(membershipOf(student) === 'INVITED' ? 'Invitación cancelada.' : 'Estudiante retirado del grupo.');
      },
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible quitar al estudiante.');
        if (text) this.notify.error(text);
      }
    });
  }

  gestionarGrupo(grupo: Grupo) {
    this.grupoActivo.set(grupo);
    this.grupoSeleccionado.set(null);
    this.busquedaEstudiante.set('');
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.limpiarImportacion();
    this.cargarDetalle(grupo.id);
    this.enfocar('.gl-detail .ui-section__title');
  }

  agregarEstudiante(grupo: Grupo) {
    this.grupoActivo.set(grupo);
    this.grupoSeleccionado.set(grupo.id);
    this.busquedaEstudiante.set('');
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.estudianteForm.reset();
    this.limpiarImportacion();
    this.cargarDetalle(grupo.id);
    this.enfocar('.gl-add input');
  }

  /** Lleva el foco al destino de lo que el usuario acaba de abrir (el detalle queda debajo de la tabla). */
  private enfocar(selector: string): void {
    afterNextRender(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>(selector);
      if (!target) return;
      if (!target.matches('input, button, a, select, textarea')) target.setAttribute('tabindex', '-1');
      target.focus();
      target.scrollIntoView?.({ block: 'nearest' });
    }, { injector: this.injector });
  }

  copiarCodigo(grupo: Grupo): void {
    const done = () => {
      this.notify.success(`Código ${grupo.codigo} copiado al portapapeles.`);
    };
    const fail = () => {
      this.notify.info(`Código del grupo: ${grupo.codigo}`);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(grupo.codigo).then(done).catch(fail);
      return;
    }
    fail();
  }

  cargarDetalle(grupoId: number) {
    this.detailLoading.set(true);
    this.grupoService.listarEstudiantes(grupoId).subscribe({
      next: estudiantes => {
        this.estudiantes.set(estudiantes);
        this.detailLoading.set(false);
      },
      error: () => {
        this.estudiantes.set([]);
        this.detailLoading.set(false);
      }
    });
  }

  confirmarAgregar() {
    if (this.estudianteForm.invalid || this.agregandoEstudiante()) {
      if (this.estudianteForm.invalid) {
        this.estudianteForm.markAllAsTouched();
        this.mensajeEstudiante.set('Revisa el correo del estudiante.');
        this.mensajeEsError.set(true);
        focusFirstInvalid(this.host.nativeElement.querySelector<HTMLElement>('.gl-add') ?? this.host.nativeElement);
      }
      return;
    }
    const { email } = this.estudianteForm.value;
    this.agregandoEstudiante.set(true);
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.grupoService.agregarEstudiante(this.grupoSeleccionado()!, email!.trim().toLowerCase()).subscribe({
      next: () => {
        // E2-10: el docente invita; la persona entra al grupo cuando acepta (su bandeja de invitaciones).
        // D-14: el servidor responde lo mismo exista o no la cuenta, así que el texto tampoco afirma que se envió.
        this.mensajeEstudiante.set(`Si ${email!.trim().toLowerCase()} es de un estudiante registrado, recibirá la invitación y verá el grupo cuando la acepte.`);
        this.mensajeEsError.set(false);
        this.estudianteForm.reset();
        this.agregandoEstudiante.set(false);
        this.cargar(true);
        this.cargarDetalle(this.grupoSeleccionado()!);
      },
      error: (err: HttpErrorResponse) => {
        this.mensajeEstudiante.set(mapAgregarEstudianteError(err));
        this.mensajeEsError.set(true);
        this.agregandoEstudiante.set(false);
      }
    });
  }

  importFileName(): string {
    return this.archivoImportacion()?.name ?? '';
  }

  columnasRequeridasTexto(): string {
    return this.importSpec()?.requiredColumns.join(', ') || 'nombre, apellido, email';
  }

  /** Columnas opcionales de la plantilla del servidor; vacío si no hay (E2-9 retiró `password`). */
  columnasOpcionalesTexto(): string {
    return this.importSpec()?.optionalColumns.join(', ') ?? '';
  }

  /**
   * Qué pasa con las cuentas nuevas de la importación (gancho de RN-10; ÚNICO sitio donde la pantalla lo dice). Desde
   * E2-9 la importación no fija contraseñas: las cuentas nacen pendientes, el administrador las aprueba y cada
   * estudiante recibe por correo su contraseña temporal. null si no hubo cuentas nuevas.
   */
  cuentasNuevasNota(result: GrupoImportResult): string | null {
    const pending = result.pendingApproval ?? 0;
    if (!pending) return null;
    return pending === 1
      ? 'La cuenta nueva queda pendiente de aprobación: cuando el administrador la apruebe, la persona recibirá por correo su contraseña temporal.'
      : `Las ${pending} cuentas nuevas quedan pendientes de aprobación: cuando el administrador las apruebe, cada persona recibirá por correo su contraseña temporal.`;
  }

  /** Columnas del archivo que el servidor leyó y no usa (p. ej. `password` de una plantilla vieja). */
  columnasIgnoradasNota(result: GrupoImportResult): string | null {
    const columns = result.ignoredColumns ?? [];
    if (!columns.length) return null;
    const names = columns.map(column => `«${column}»`).join(', ');
    return columns.length === 1
      ? `Se ignoró la columna ${names}: ya no se usa al importar.`
      : `Se ignoraron las columnas ${names}: ya no se usan al importar.`;
  }

  descargarPlantilla(): void {
    this.grupoService.descargarPlantillaImportacion().subscribe({
      next: response => {
        const blob = response.body;
        if (!blob) return;
        const filename = this.importSpec()?.templateFilename || 'plantilla_importacion_estudiantes_siep.xlsx';
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.mensajeEstudiante.set('No fue posible descargar la plantilla Excel.');
        this.mensajeEsError.set(true);
      }
    });
  }

  seleccionarArchivoImportacion(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.elegirArchivo(input.files?.[0] ?? null)) input.value = '';
  }

  arrastrarSobre(event: Event): void {
    event.preventDefault();
    this.arrastrando.set(true);
  }

  soltarArchivo(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando.set(false);
    // El control nativo conserva su elección anterior: se limpia para que no muestre un archivo que ya no vale.
    this.resetImportFileInput();
    this.elegirArchivo(event.dataTransfer?.files?.[0] ?? null);
  }

  /** Acepta el archivo si es .xlsx; si no, lo rechaza con un mensaje. true si quedó elegido (o se quitó). */
  private elegirArchivo(file: File | null): boolean {
    this.archivoImportacion.set(file);
    this.resultadoImportacion.set(null);
    this.erroresImportacion.set([]);
    if (file && !/\.xlsx$/i.test(file.name)) {
      this.mensajeEstudiante.set('Selecciona un archivo .xlsx.');
      this.mensajeEsError.set(true);
      this.archivoImportacion.set(null);
      return false;
    }
    return true;
  }

  descargarPlantillaImportacion(): void {
    this.descargarPlantilla();
  }

  importarEstudiantes(): void {
    const grupo = this.grupoActivo();
    const file = this.archivoImportacion();
    if (!grupo || !file || this.importandoEstudiantes()) return;

    this.importandoEstudiantes.set(true);
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.grupoService.importarEstudiantes(grupo.id, file).subscribe({
      next: result => {
        this.resultadoImportacion.set(result);
        this.erroresImportacion.set(result.errors);
        this.archivoImportacion.set(null);
        this.resetImportFileInput();
        this.importandoEstudiantes.set(false);
        this.grupos.update(list => list.map(g => g.id === grupo.id ? result.grupo : g));
        this.grupoActivo.set(result.grupo);
        this.cargarDetalle(grupo.id);
        const warnings = result.errors.length ? ` ${result.errors.length} fila(s) con observaciones.` : '';
        this.mensajeEstudiante.set(
          `Importación completada: ${result.assigned} invitados, ${result.created} cuentas nuevas, ${result.existing} ya existían.${warnings}`
        );
        this.mensajeEsError.set(false);
      },
      error: (err: HttpErrorResponse) => {
        const result = err.error?.data as GrupoImportResult | undefined;
        if (result) {
          this.resultadoImportacion.set(result);
          this.erroresImportacion.set(result.errors ?? []);
        }
        this.mensajeEstudiante.set(this.mapImportError(err));
        this.mensajeEsError.set(true);
        this.importandoEstudiantes.set(false);
      }
    });
  }

  private resetImportFileInput(): void {
    if (this.importFileInput?.nativeElement) {
      this.importFileInput.nativeElement.value = '';
    }
  }

  private mapImportError(err: HttpErrorResponse): string {
    const body = err.error;
    if (typeof body?.message === 'string' && body.message.trim()) {
      return body.message;
    }
    if (typeof body === 'string' && body.trim()) {
      return body;
    }
    return 'No fue posible importar el archivo. Verifica columnas nombre, apellido y email.';
  }

  private limpiarImportacion(): void {
    this.archivoImportacion.set(null);
    this.resultadoImportacion.set(null);
    this.erroresImportacion.set([]);
  }
}
