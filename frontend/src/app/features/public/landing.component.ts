import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { APP_BRAND } from '../../core/config/brand.config';
import { PUBLIC_ANCHORS, PublicBarComponent } from '../../shared/layout/public-bar.component';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { SiepParticleLayerComponent } from '../../shared/ui/siep-particle-layer.component';

interface TrainingCase {
  icon: string;
  title: string;
  text: string;
  tag: string;
  /** Solo hay un caso jugable hoy; los demás se anuncian como «Próximamente». */
  available: boolean;
}

interface WorkflowStep {
  step: string;
  icon: string;
  title: string;
  text: string;
}

interface RoleCard {
  icon: string;
  title: string;
  text: string;
  features: string[];
}

interface EthicsItem {
  icon: string;
  title: string;
  text: string;
}

/**
 * Portada (plan visual F4-1): una identidad con dos pieles. El héroe presenta el simulador en la piel juego (VD-2:
 * el violeta solo para «simulador»); las secciones, en la piel portal. Sin acentos de color por tarjeta ni puntos de
 * color (VD-3): un solo tratamiento de icono con tokens.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, MatIconModule, PublicBarComponent, SiepParticleLayerComponent, UiBadge, UiButton],
  templateUrl: './landing.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  readonly brand = APP_BRAND;
  /** Anclas de la barra pública (plan visual F3-4): las secciones de esta página. */
  readonly anchors = PUBLIC_ANCHORS;

  /** Escena de la vista previa en WebP a su tamaño nativo (plan visual F4-4: antes, un PNG de 389 KB). */
  readonly simulatorSceneSrc = '/assets/images/institution/escena-portada.webp';

  /** Partículas del héroe en pausa (H-22, VD-25). */
  readonly particlesPaused = signal(false);

  readonly caseInfo = [
    { icon: 'person', label: 'Rol', text: 'Psicólogo social en formación' },
    {
      icon: 'track_changes',
      label: 'Objetivo',
      text: 'Identificar riesgo, ruta de atención y decisión ética.'
    },
    { icon: 'description', label: 'Contexto', text: 'Entorno familiar con posible situación de riesgo.' }
  ];

  readonly heroDecisions = [
    { icon: 'shield', label: 'Activar ruta institucional' },
    { icon: 'forum', label: 'Solicitar más contexto' },
    { icon: 'edit_note', label: 'Registrar observación ética' }
  ];

  readonly trustItems = ['Entorno seguro', 'Aprendizaje ético', 'Evaluación formativa'];

  readonly trainingCases: TrainingCase[] = [
    {
      icon: 'home_work',
      title: 'Violencia basada en género',
      text: 'Evalúa señales de riesgo, activa rutas de protección y documenta decisiones con criterio ético y legal.',
      tag: 'Disponible · caso sensible',
      available: true
    },
    {
      icon: 'groups',
      title: 'Desplazamiento forzado',
      text: 'Analiza contexto comunitario, necesidades de apoyo y articulación con redes institucionales del territorio.',
      tag: 'Próximamente',
      available: false
    },
    {
      icon: 'diversity_3',
      title: 'Conflicto comunitario',
      text: 'Practica mediación psicosocial, lectura del conflicto y decisiones que respeten derechos y convivencia.',
      tag: 'Próximamente',
      available: false
    }
  ];

  readonly workflow: WorkflowStep[] = [
    { step: '1', icon: 'folder_open', title: 'Selecciona un caso', text: 'Elige un escenario de entrenamiento acorde a tu cohorte.' },
    { step: '2', icon: 'psychology', title: 'Analiza la situación', text: 'Explora contexto, personajes y señales antes de intervenir.' },
    { step: '3', icon: 'account_tree', title: 'Toma decisiones', text: 'Cada elección queda registrada en la trazabilidad.' },
    { step: '4', icon: 'bar_chart', title: 'Recibe retroalimentación', text: 'Consulta orientación formativa y evaluación con rúbricas.' }
  ];

  readonly roles: RoleCard[] = [
    {
      icon: 'school',
      title: 'Estudiante',
      text: 'Practica intervención psicosocial en escenarios simulados y recibe retroalimentación formativa.',
      features: ['Simulaciones', 'Bitácora', 'Retroalimentación']
    },
    {
      icon: 'supervisor_account',
      title: 'Profesor',
      text: 'Asigna casos, supervisa trazabilidad y evalúa el desempeño con rúbricas académicas.',
      features: ['Rúbricas', 'Evaluación', 'Seguimiento']
    },
    {
      icon: 'admin_panel_settings',
      title: 'Administrador',
      text: 'Gestiona usuarios, publica casos y configura el entorno académico del simulador.',
      features: ['Gestión', 'Trazabilidad', 'Reportes']
    }
  ];

  readonly ethicsItems: EthicsItem[] = [
    { icon: 'exit_to_app', title: 'Salida segura', text: 'Recursos institucionales en contenidos sensibles.' },
    { icon: 'record_voice_over', title: 'Lenguaje no estigmatizante', text: 'Comunicación centrada en derechos.' },
    { icon: 'lock', title: 'Confidencialidad', text: 'Bitácoras protegidas con fines formativos.' },
    { icon: 'route', title: 'Rutas institucionales', text: 'Orientación cuando el escenario lo requiera.' },
    { icon: 'grading', title: 'Evaluación formativa', text: 'Sin diagnósticos ni decisiones automáticas.' }
  ];
}
