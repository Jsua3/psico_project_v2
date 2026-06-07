import { Injectable, signal } from '@angular/core';
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

  reset(): void {
    this.nodes.set([
      { id: 'patient', label: 'Paciente', type: 'patient', revealed: true, affinity: 0 }
    ]);
    this.edges.set([]);
  }
}
