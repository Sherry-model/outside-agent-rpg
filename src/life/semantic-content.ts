import Ajv from 'ajv';
import schema from '../../schemas/semantic-content.schema.json';
import raw from './semantic.json';
import type { SemanticContent } from '../cognition/semantic-types';
const validate = new Ajv({strict:true}).compile<SemanticContent>(schema);
export function parseSemantic(data: unknown): SemanticContent {
  if (!validate(data)) throw new Error('语义内容格式错误：'+JSON.stringify(validate.errors));
  const scopes = {goal:new Set<string>(),gate:new Set<string>()};
  const facets = new Map<string,string>();
  for (const meaning of Object.values(data.sources)) {
    if (!data.topics[meaning.topic]) throw new Error('语义来源引用未知主题。');
    for (const clause of meaning.clauses) {
      const key = meaning.topic+'/'+clause.facet, signature = JSON.stringify(clause);
      if (facets.has(key) && facets.get(key)!==signature) throw new Error('同一 facet 有冲突命题。');
      facets.set(key,signature);
      if (clause.relation) scopes[clause.relation.role].add(clause.relation.scope);
    }
  }
  if (new Set(data.driftRules.map(r=>r.id)).size!==data.driftRules.length) throw new Error('漂移规则 ID 重复。');
  for (const r of data.driftRules) if(r.fromScope===r.toScope || !scopes.gate.has(r.fromScope) || !scopes.goal.has(r.toScope)) throw new Error('漂移必须跨越两个明确且存在的适用范围。');
  return structuredClone(data);
}
export const semantic = parseSemantic(raw);
