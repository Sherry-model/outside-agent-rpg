/** Offline design experiment. Not imported by the released game. */
export type Grade = 'critical' | 'success' | 'failure' | 'fumble';
export interface Clause {
  facet: string;
  gist: string;
  epistemic: 'observed' | 'reported' | 'unknown';
  priority: number;
}
export interface Note {
  id: string;
  topic: string;
  text: string;
  weight: number;
  pinned: boolean;
  /** An authored verb phrase. Enables one bounded distortion operator. */
  actionCue: string;
  /** Opt-in grammatical/semantic role; prevents arbitrary word-salad links. */
  relationRole?: 'goal' | 'gate';
  clause: Clause;
}
export interface Memory {
  id: string;
  title: string;
  text: string;
  indexWeight: 1;
  recallWeight: number;
  /** Audit only: not available as evidence to a player or to recall(). */
  audit: {
    sourceIds: string[];
    omittedFacets: string[];
    integrity: 'compressed' | 'distorted';
    operator: 'select_facets' | 'false_prerequisite';
  };
}
export interface Recall {
  memoryId: string;
  text: string;
  weight: number;
}
export interface Result {
  grade: Grade;
  retained: Note[];
  memories: Memory[];
  beforeLoad: number;
  afterLoad: number;
  requestedDistortions: number;
  actualDistortions: number;
}

export function classify(value: number, target: number, stressed: boolean): Grade {
  if (!Number.isInteger(value) || value < 1 || value > 100 ||
      !Number.isInteger(target) || target < 5 || target > 95) throw new Error('Invalid d100');
  const margin = target - value;
  return margin >= 30 ? 'critical' : margin >= 0 ? 'success' :
    margin <= -30 && stressed ? 'fumble' : 'failure';
}

export function load(notes: Note[], memories: Memory[], recalls: Recall[] = []): number {
  return notes.reduce((n, item) => n + item.weight, 0) +
    memories.reduce((n, item) => n + item.indexWeight, 0) +
    recalls.reduce((n, item) => n + item.weight, 0);
}

/** Only the current compressed body is loaded, never an audit/history record. */
export function recall(memory: Memory, active: Recall[]): Recall[] {
  if (active.some(item => item.memoryId === memory.id)) return structuredClone(active);
  return [...structuredClone(active), {
    memoryId: memory.id, text: memory.text, weight: memory.recallWeight,
  }];
}

/** Seeded stable ranking; does not consume a second game dice roll. */
function rank(id: string, seed: number): number {
  let value = seed >>> 0;
  for (const char of id) value = Math.imul(value ^ char.codePointAt(0)!, 16777619) >>> 0;
  return value;
}

function memory(id: string, title: string, notes: Note[], distorted: boolean, limit: number): Memory {
  const ordered = [...notes].sort((a, b) => b.clause.priority - a.clause.priority || a.id.localeCompare(b.id, 'en'));
  // Different polarities/source types must have different authored facet IDs.
  const facets = [...new Map(ordered.map(item => [item.clause.facet, item.clause])).values()];
  const selected = facets.slice(0, limit);
  const text = distorted
    ? `要${notes[0].actionCue}，得先${notes[1].actionCue}。`
    : selected.map(clause => `${clause.epistemic === 'reported' ? '据转述，' : clause.epistemic === 'unknown' ? '尚不能确定：' : ''}${clause.gist}`).join('；') + '。';
  return {
    id, title, text, indexWeight: 1, recallWeight: Math.max(2, Math.min(5, Math.ceil(text.length / 45))),
    audit: {
      sourceIds: notes.map(item => item.id),
      omittedFacets: distorted ? facets.map(c => c.facet) : facets.slice(limit).map(c => c.facet),
      integrity: distorted ? 'distorted' : 'compressed',
      operator: distorted ? 'false_prerequisite' : 'select_facets',
    },
  };
}

/** Pure proposal: caller supplies the one d100 result and a persisted seed. */
export function compress(notes: Note[], topics: Record<string, string>, grade: Grade, seed: number): Result {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('Invalid seed');
  if (new Set(notes.map(item => item.id)).size !== notes.length) throw new Error('Duplicate note ID');
  const facets = new Map<string, string>();
  for (const note of notes) {
    if (!note.id || !topics[note.topic] || !note.actionCue || !note.clause.gist ||
        !Number.isInteger(note.weight) || note.weight < 1) throw new Error('Invalid note');
    const key = `${note.topic}/${note.clause.facet}`;
    const signature = `${note.clause.epistemic}/${note.clause.gist}/${note.clause.priority}`;
    if (facets.has(key) && facets.get(key) !== signature) throw new Error('Conflicting facet: use separate IDs for different claims');
    facets.set(key, signature);
  }
  const pool = notes.filter(note => !note.pinned).sort((a, b) => rank(a.id, seed) - rank(b.id, seed) || a.id.localeCompare(b.id, 'en'));
  const used = new Set<string>();
  const memories: Memory[] = [];
  const requestedDistortions = grade === 'fumble' ? 2 : grade === 'failure' ? 1 : 0;
  const add = (group: Note[], title: string, distorted: boolean) => {
    group.forEach(note => used.add(note.id));
    memories.push(memory(`experiment-${seed}-${memories.length + 1}`, title, group, distorted, grade === 'critical' ? 3 : 2));
  };
  // At most two linear scans. Never enumerate all pairs or invent absent notes.
  for (let i = 0; i < requestedDistortions; i++) {
    const first = pool.find(note => !used.has(note.id) && note.relationRole === 'goal');
    const second = first && pool.find(note => !used.has(note.id) && note.relationRole === 'gate' && note.topic !== first.topic);
    if (!first || !second) break;
    add([first, second], '一段行动的先后', true);
  }
  const buckets = new Map<string, Note[]>();
  for (const note of pool.filter(note => !used.has(note.id))) {
    const bucket = buckets.get(note.topic) ?? [];
    bucket.push(note);
    buckets.set(note.topic, bucket);
  }
  // With only two related sources, critical falls back to the success group.
  // A better roll must not prevent an otherwise possible compression.
  const min = 2;
  const max = grade === 'critical' ? 6 : 3;
  for (const [topic, bucket] of buckets) {
    // Balanced groups avoid turning a group of four into 3 + an orphan.
    const count = Math.ceil(bucket.length / max);
    let offset = 0;
    for (let i = 0; i < count; i++) {
      const size = Math.ceil((bucket.length - offset) / (count - i));
      const group = bucket.slice(offset, offset + size);
      offset += size;
      if (group.length >= min) add(group, topics[topic], false);
    }
  }
  const retained = structuredClone(notes.filter(note => !used.has(note.id)));
  return {
    grade, retained, memories, beforeLoad: load(notes, []), afterLoad: load(retained, memories),
    requestedDistortions, actualDistortions: memories.filter(item => item.audit.integrity === 'distorted').length,
  };
}
