import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';

import { SimulationService } from '../../core/api/simulation.service';
import { CaseBrief, CaseBriefCharacter } from '../../core/models/simulation.model';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { CharacterVisual, resolveCharacter, resolveRecipeId } from '../character/kit/character-visual.resolver';
import { KitBundle } from '../character/kit/kit-engine';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import { KitService } from '../character/kit/kit.service';
import { accessNotice } from './case-access.util';
import { DRAFT_COPY } from './draft-copy';

type BriefError = { status?: number; error?: { code?: string } | null };

const NOT_ASSIGNED = accessNotice({ allowed: false, reason: 'NOT_ASSIGNED' })!;
const NOT_FOUND_MESSAGE = 'No encontramos este caso: puede que ya no esté publicado o que el enlace esté mal.';

/**
 * Ficha del caso antes de empezar (plan visual F10-1; RF-16, CU-07; contrato C8). Es una lectura: contexto, personajes
 * (con su retrato del kit a ×3) y objetivos de aprendizaje, y **nunca crea el intento** (RN-07). «Comenzar» pasa al
 * juego del caso, donde sigue estando el aviso de contenido (ETH-01). La decisión de acceso es del servidor (`access`:
 * asignación, ventana y secuencia): aquí se dice con palabras y «Comenzar» queda deshabilitado con su motivo.
 */
@Component({
  selector: 'app-case-brief',
  imports: [KitFigureComponent, MatIconModule, UiButton, UiCard, UiErrorState, UiPageHeader, UiSection, UiSkeleton],
  templateUrl: './case-brief.component.html',
  styleUrl: './case-brief.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseBriefComponent {
  private readonly simulationService = inject(SimulationService);
  private readonly router = inject(Router);
  private readonly kit = inject(KitService);
  private readonly caseVersionId = Number(inject(ActivatedRoute).snapshot.paramMap.get('caseVersionId'));

  protected readonly brief = signal<CaseBrief | null>(null);
  private readonly loading = signal(true);
  protected readonly error = signal<BriefError | null>(null);

  protected readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.brief() === null),
  });
  protected readonly errorKind = computed(() => errorKindFromStatus(this.error()?.status));
  /** El texto propio de los dos errores que no son «algo falló»: el caso no es tuyo o no existe. */
  protected readonly errorMessage = computed<string | null>(() => {
    const error = this.error();
    if (error?.status === 403 && error.error?.code === 'ACCESS_NOT_ASSIGNED') return `${NOT_ASSIGNED.title}. ${NOT_ASSIGNED.detail}`;
    if (error?.status === 404) return NOT_FOUND_MESSAGE;
    return null;
  });

  protected readonly access = computed(() => {
    const brief = this.brief();
    return brief ? accessNotice(brief.access) : null;
  });
  protected readonly startBlockedReason = computed(() => {
    const notice = this.access();
    return notice ? `${notice.title}. ${notice.detail}` : null;
  });
  protected readonly characters = computed(() => {
    const bundle = this.kit.bundle();
    return (this.brief()?.characters ?? []).map(character => ({ ...character, visual: bundle ? this.visualOf(bundle, character) : null }));
  });
  protected readonly hasObjectives = computed(() => (this.brief()?.learningObjectives.length ?? 0) > 0);
  protected readonly hasContext = computed(() => !!this.brief()?.context.trim());
  protected readonly isPending = computed(() => !this.hasObjectives() && this.characters().length === 0);

  protected readonly sensitiveNote = DRAFT_COPY.briefSensitiveNote.text;
  protected readonly pendingNote = DRAFT_COPY.briefPending.text;

  constructor() {
    // El retrato es un complemento: si el kit no carga, cada personaje se queda con su nombre y su rol.
    this.kit.load().catch(() => undefined);
    this.load();
  }

  protected load(): void {
    if (!this.caseVersionId) {
      this.error.set({ status: 404 });
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.simulationService.getCaseBrief(this.caseVersionId).subscribe({
      next: brief => {
        this.brief.set(brief);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (error: BriefError) => {
        this.error.set(error ?? {});
        this.loading.set(false);
      },
    });
  }

  /** El juego crea o reanuda el intento y pide el consentimiento (ETH-01): la ficha solo lleva hasta allí. */
  protected start(): void {
    void this.router.navigate(['/portal/simulador', this.caseVersionId]);
  }

  protected backToCatalog(): void {
    void this.router.navigate(['/portal/simulador']);
  }

  private visualOf(bundle: KitBundle, character: CaseBriefCharacter): CharacterVisual | null {
    const recipeId = resolveRecipeId(bundle, { actor: character.portraitKey, speaker: character.displayName });
    return recipeId ? resolveCharacter(bundle, { kind: 'receta', recipeId }) : null;
  }
}
