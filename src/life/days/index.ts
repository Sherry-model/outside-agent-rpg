import raw from './content.json';
import semanticRaw from './semantic.json';
import { parseContent } from '../../cognition/parser';
import { parseSemantic } from '../semantic-content';
import type { NoteTemplate, Outcome } from '../../cognition/types';
export const daysSemantic = parseSemantic(semanticRaw);
const parsed = parseContent(raw);
function annotate(note:NoteTemplate):NoteTemplate {
  const meaning=daysSemantic.sources[note.id];
  if(!meaning) throw new Error(`缺少生活来源语义：${note.id}`);
  return {...note,meaning:structuredClone(meaning)};
}
function outcome(o:Outcome):Outcome { return {...o,...(o.inject?{inject:o.inject.map(annotate)}:{})}; }
export const daysContent={...parsed,nodes:parsed.nodes.map(n=>({...n,
  ...(n.inject?{inject:n.inject.map(annotate)}:{}),
  choices:n.choices.map(c=>({...c,...(c.outcome?{outcome:outcome(c.outcome)}:{}),
    ...(c.outcomes?{outcomes:Object.fromEntries(Object.entries(c.outcomes).map(([k,o])=>[k,outcome(o)])) as typeof c.outcomes}:{})})),
}))};
