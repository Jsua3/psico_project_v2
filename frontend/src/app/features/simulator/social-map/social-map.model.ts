export interface SocialNode {
  id: string;
  label: string;
  type: 'patient' | 'family' | 'friend' | 'professional' | 'antagonist';
  revealed: boolean;
  affinity: number; // -1 to 1
}

export interface SocialEdge {
  from: string;
  to: string;
  strength: number; // 0-1
  type: 'support' | 'conflict' | 'neutral' | 'unknown';
}
