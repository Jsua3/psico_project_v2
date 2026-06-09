import { Injectable, signal } from '@angular/core';
import { MapObjectState } from '../../../core/models/simulation.model';
import { SocialNode, SocialEdge } from './social-map.model';

@Injectable({ providedIn: 'root' })
export class SocialMapService {
  readonly nodes = signal<SocialNode[]>([
    { id: 'patient', label: 'Paciente', type: 'patient', revealed: true, affinity: 0 }
  ]);
  readonly edges = signal<SocialEdge[]>([]);

  revealNode(node: SocialNode): void {
    this.nodes.update(nodes => {
      const existing = nodes.find(n => n.id === node.id);
      if (existing) {
        return nodes.map(n => n.id === node.id ? { ...n, ...node, revealed: true } : n);
      }
      return [...nodes, { ...node, revealed: true }];
    });
  }

  updateAffinity(nodeId: string, delta: number): void {
    this.nodes.update(nodes =>
      nodes.map(n => n.id === nodeId
        ? { ...n, affinity: Math.max(-1, Math.min(1, n.affinity + delta)) }
        : n
      )
    );
  }

  addEdge(edge: SocialEdge): void {
    this.edges.update(edges => {
      const exists = edges.find(e => e.from === edge.from && e.to === edge.to);
      if (exists) return edges.map(e => e.from === edge.from && e.to === edge.to ? edge : e);
      return [...edges, edge];
    });
  }

  syncFromWorldObjects(objects: MapObjectState[]): void {
    for (const object of objects) {
      if (object.type !== 'PERSON') continue;
      this.revealNode({
        id: object.key,
        label: object.label,
        type: this.classifyPerson(object),
        revealed: true,
        affinity: 0,
      });
      this.addEdge({
        from: 'patient',
        to: object.key,
        strength: 0.45,
        type: 'unknown',
      });
    }
  }

  reset(): void {
    this.nodes.set([
      { id: 'patient', label: 'Paciente', type: 'patient', revealed: true, affinity: 0 }
    ]);
    this.edges.set([]);
  }

  private classifyPerson(object: MapObjectState): SocialNode['type'] {
    const text = `${object.label} ${object.interactionText} ${object.interactionPrompt}`.toLowerCase();
    if (text.includes('orientador') || text.includes('psicolog') || text.includes('profesional') || text.includes('lic.')) {
      return 'professional';
    }
    if (text.includes('agresor') || text.includes('riesgo') || text.includes('violencia')) {
      return 'antagonist';
    }
    return 'family';
  }
}
