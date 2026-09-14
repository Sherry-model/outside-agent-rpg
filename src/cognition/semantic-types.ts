export interface Clause {
  facet: string;
  gist: string;
  abstract: string;
  epistemic: 'observed' | 'reported' | 'unknown';
  priority: number;
  tags: string[];
  relation?: { role: 'goal' | 'gate'; scope: string; action: string };
}
export interface Meaning { topic: string; clauses: Clause[]; depth: number }
export interface DriftRule {
  id: string; fromScope: string; toScope: string;
  quality: number; tag: string;
}
export interface SemanticContent {
  version: '0.4.0'; topics: Record<string, string>;
  sources: Record<string, Meaning>;
  driftRules: DriftRule[];
}
export interface Drift {
  ruleId: string; sourceScope: string; targetScope: string;
  sourceItemId: string; targetItemId: string;
}
