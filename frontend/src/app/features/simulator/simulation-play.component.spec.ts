import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { SimulationPlayComponent } from './simulation-play.component';
import { SimulationService } from '../../core/api/simulation.service';
import { AudioDirectorService } from './audio-director.service';
import { SocialMapService } from './social-map/social-map.service';
import { SimulationAttemptState, MapObjectState, DialogueState } from '../../core/models/simulation.model';

function mockAttempt(status: SimulationAttemptState['status'] = 'IN_PROGRESS'): SimulationAttemptState {
  return {
    attemptId: 'a1',
    attemptToken: 'tk',
    caseVersionId: 1,
    caseTitle: 'Test',
    status,
    accumulatedScore: 0,
    stressIndex: 0,
    completionReport: null,
    feedback: null,
    metrics: { victimRisk: 0, trustLevel: 0 },
    currentNode: {
      id: 1, key: 'n1', title: 'N1', narrative: '',
      terminal: false, sensitiveContent: false, safeExitRequired: false,
      warningMessage: null, options: [], supportResources: []
    },
    supportResources: []
  } as unknown as SimulationAttemptState;
}

function mockDialogue(withChoices = false): DialogueState {
  return {
    key: 'd1', speakerName: 'NPC', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'NPC', text: 'Hi', emotion: 'neutral' }],
    choices: withChoices
      ? [{ key: 'c1', text: 'Choice', decisionOptionId: 1, requiredToolCode: null, effect: {} }]
      : []
  } as unknown as DialogueState;
}

function mockInteraction(type: MapObjectState['type'] = 'PERSON'): MapObjectState {
  return {
    key: 'p1', label: 'P', type, x: 0, y: 0, width: 0, height: 0,
    color: '#fff', icon: 'person', shortCode: 'P001', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null,
    toolCode: null, dialogue: null
  } as unknown as MapObjectState;
}

const mockSimService = {
  getActiveAttempt: () => of(null),
  startAttempt: () => of(mockAttempt()),
  getProgressMap: () => of(null),
  getWorld: () => of({ map: { key: 'h', title: 'H', objects: [] }, objects: [], tools: [], inventory: [] })
};

const mockAudioDirectorService = {
  init: () => {},
  dispose: () => {},
  setMasterVolume: () => {},
  playSfx: () => {},
  setStressLevel: () => {},
  playResolution: () => {},
  pause: () => {},
  resume: () => {},
  stopAll: () => {}
};

const mockSocialMapService = {
  reset: () => {},
  init: () => {},
  getState: () => of(null)
};

describe('SimulationPlayComponent — viewMode', () => {
  let component: SimulationPlayComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: SimulationService, useValue: mockSimService },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: AudioDirectorService, useValue: mockAudioDirectorService },
        { provide: SocialMapService, useValue: mockSocialMapService }
      ]
    }).compileComponents();

    const fixture: ComponentFixture<SimulationPlayComponent> =
      TestBed.createComponent(SimulationPlayComponent);
    component = fixture.componentInstance;
    // Do NOT call detectChanges — we test computeds directly without triggering ngOnInit HTTP calls
  });

  it('returns "explore" when attempt is null', () => {
    component.attempt.set(null);
    expect(component.viewMode()).toBe('explore');
  });

  it('returns "outcome" when status is COMPLETED', () => {
    component.attempt.set(mockAttempt('COMPLETED'));
    expect(component.viewMode()).toBe('outcome');
  });

  it('returns "outcome" when status is SAFE_EXITED', () => {
    component.attempt.set(mockAttempt('SAFE_EXITED'));
    expect(component.viewMode()).toBe('outcome');
  });

  it('outcome takes priority over journalOpen', () => {
    component.attempt.set(mockAttempt('COMPLETED'));
    component.journalOpen.set(true);
    expect(component.viewMode()).toBe('outcome');
  });

  it('returns "journal" when journalOpen and IN_PROGRESS', () => {
    component.attempt.set(mockAttempt());
    component.journalOpen.set(true);
    expect(component.viewMode()).toBe('journal');
  });

  it('returns "dialogue-cinematic" for dialogue with no choices', () => {
    component.attempt.set(mockAttempt());
    component.dialogue.set(mockDialogue(false));
    expect(component.viewMode()).toBe('dialogue-cinematic');
  });

  it('returns "dialogue-right" for dialogue with choices + PERSON interaction', () => {
    component.attempt.set(mockAttempt());
    component.dialogue.set(mockDialogue(true));
    component.selectedInteraction.set(mockInteraction('PERSON'));
    expect(component.viewMode()).toBe('dialogue-right');
  });

  it('returns "dialogue-cinematic" for choices + non-PERSON interaction', () => {
    component.attempt.set(mockAttempt());
    component.dialogue.set(mockDialogue(true));
    component.selectedInteraction.set(mockInteraction('TOOL'));
    expect(component.viewMode()).toBe('dialogue-cinematic');
  });

  it('returns "dialogue-cinematic" when dialogue has choices but selectedInteraction is null', () => {
    component.attempt.set(mockAttempt());
    component.dialogue.set(mockDialogue(true));
    component.selectedInteraction.set(null);
    expect(component.viewMode()).toBe('dialogue-cinematic');
  });

  it('returns "explore" when IN_PROGRESS, no dialogue, journal closed', () => {
    component.attempt.set(mockAttempt());
    component.dialogue.set(null);
    component.journalOpen.set(false);
    expect(component.viewMode()).toBe('explore');
  });
});

describe('SimulationPlayComponent — selectedToolCode', () => {
  let component: SimulationPlayComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: SimulationService, useValue: mockSimService },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: AudioDirectorService, useValue: mockAudioDirectorService },
        { provide: SocialMapService, useValue: mockSocialMapService }
      ]
    }).compileComponents();
    component = TestBed.createComponent(SimulationPlayComponent).componentInstance;
  });

  it('returns null when no dialogue is active', () => {
    component.dialogue.set(null);
    component.selectedInteraction.set({ toolCode: 'TOOL-1' } as unknown as MapObjectState);
    expect(component.selectedToolCode()).toBeNull();
  });

  it('returns toolCode when dialogue is active and interaction has toolCode', () => {
    component.dialogue.set(mockDialogue());
    component.selectedInteraction.set({ toolCode: 'TOOL-1' } as unknown as MapObjectState);
    expect(component.selectedToolCode()).toBe('TOOL-1');
  });
});
