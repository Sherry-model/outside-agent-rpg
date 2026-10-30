import nodes from './events.json';
import news from './news.json';
import meanings from './semantic.json';
import type {Content,Node,News,NoteTemplate} from '../../cognition/types';
import type {SemanticContent} from '../../cognition/semantic-types';
import {parseSemantic} from '../semantic-content';
export function withPainter(base:Content):Content {
 const c=structuredClone(base);c.version='0.18.0';
 c.semantic=parseSemantic({...c.semantic!,driftRules:[...c.semantic!.driftRules,{id:'painter_sunset_mix',fromScope:'painter_old_sunset',toScope:'painter_new_work',quality:85,tag:'belief_painter_sunset',belief:{gist:'我记得《夜班站台》画的是日落',abstract:'我记得和画师谈过一幅画'}}],topics:{...c.semantic!.topics,...meanings.topics},sources:{...c.semantic!.sources,...meanings.sources as SemanticContent['sources']}});
 const annotate=(n:NoteTemplate)=>({...n,meaning:structuredClone(c.semantic!.sources[n.id])});
 for(const raw of nodes){const n=structuredClone(raw) as unknown as Node;n.inject=n.inject?.map(annotate);for(const ch of n.choices)ch.outcome!.inject=ch.outcome!.inject?.map(annotate);c.nodes.push(n);}
 c.news.push(...(news as News[]).map(n=>({...n,...annotate(n)})));
 return c;
}
