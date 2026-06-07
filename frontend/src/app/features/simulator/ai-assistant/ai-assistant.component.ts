import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="assistant-panel" [class.open]="isOpen()">
      <button class="assistant-toggle" (click)="toggleOpen()"
              [attr.aria-expanded]="isOpen()"
              aria-controls="assistant-chat"
              aria-label="Asistente de orientación">
        Orientación
      </button>
      @if (isOpen()) {
        <div class="chat-area" id="assistant-chat" role="log" aria-live="polite" aria-label="Conversación con asistente">
          @for (msg of messages(); track $index) {
            <div class="message" [class]="msg.role">
              <span class="msg-text">{{ msg.text }}</span>
            </div>
          }
          @if (loading()) {
            <div class="message assistant loading" aria-label="Pensando...">Pensando…</div>
          }
        </div>
        <div class="input-area">
          <input
            type="text"
            [(ngModel)]="currentQuestion"
            (keyup.enter)="sendQuestion()"
            placeholder="Pregunta sobre el caso…"
            [disabled]="loading()"
            aria-label="Pregunta al asistente"
          />
          <button (click)="sendQuestion()" [disabled]="loading() || !currentQuestion.trim()">
            Enviar
          </button>
        </div>
        <p class="disclaimer">
          El asistente orienta conceptualmente. No revela respuestas antes de decidir.
        </p>
      }
    </div>
  `,
  styles: [`
    .assistant-panel {
      position: relative;
      background: rgba(17,24,39,0.9);
      border: 1px solid rgba(124,77,255,0.3);
      border-radius: 10px;
      padding: 8px;
      backdrop-filter: blur(8px);
      max-width: 320px;
    }
    .assistant-toggle {
      background: rgba(124,77,255,0.15);
      border: 1px solid rgba(124,77,255,0.4);
      color: #B69CFF;
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 12px;
      width: 100%;
      text-align: left;
    }
    .assistant-toggle:focus-visible { outline: 2px solid #B69CFF; }
    .chat-area {
      margin-top: 8px;
      max-height: 220px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .message { padding: 6px 10px; border-radius: 8px; font-size: 12px; line-height: 1.5; }
    .message.user { background: rgba(124,77,255,0.2); color: #E8E0FF; align-self: flex-end; max-width: 85%; }
    .message.assistant { background: rgba(255,255,255,0.05); color: #F4F7FB; align-self: flex-start; max-width: 85%; }
    .message.loading { color: #7D8290; font-style: italic; }
    .input-area { display: flex; gap: 6px; margin-top: 8px; }
    .input-area input {
      flex: 1; background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px; color: #F4F7FB;
      padding: 5px 8px; font-size: 12px;
    }
    .input-area input:focus { outline: 2px solid #B69CFF; }
    .input-area button {
      background: rgba(124,77,255,0.3); border: none; color: #E8E0FF;
      border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px;
    }
    .input-area button:disabled { opacity: 0.4; cursor: not-allowed; }
    .input-area button:focus-visible { outline: 2px solid #B69CFF; }
    .disclaimer { font-size: 10px; color: #7D8290; margin-top: 6px; margin-bottom: 0; font-style: italic; }
  `]
})
export class AIAssistantComponent {
  readonly attemptId            = input<string>('');
  readonly currentNodeId        = input<string>('');
  readonly decisionAlreadyTaken = input<boolean>(false);

  readonly isOpen   = signal(false);
  readonly messages = signal<ChatMessage[]>([]);
  readonly loading  = signal(false);
  currentQuestion   = '';

  constructor(private http: HttpClient) {}

  toggleOpen(): void { this.isOpen.update(v => !v); }

  async sendQuestion(): Promise<void> {
    const q = this.currentQuestion.trim();
    if (!q || this.loading()) return;
    this.currentQuestion = '';
    this.messages.update(msgs => [...msgs, { role: 'user', text: q }]);
    this.loading.set(true);

    try {
      const resp = await firstValueFrom(
        this.http.post<{ response: string }>('/api/simulation/ai-assistant', {
          attempt_id: this.attemptId(),
          question: q,
          current_node_id: this.currentNodeId(),
          decision_already_taken: this.decisionAlreadyTaken(),
        })
      );
      this.messages.update(msgs => [...msgs, { role: 'assistant', text: resp.response }]);
    } catch {
      this.messages.update(msgs => [...msgs, {
        role: 'assistant', text: 'Error al conectar con el asistente.'
      }]);
    } finally {
      this.loading.set(false);
    }
  }
}
