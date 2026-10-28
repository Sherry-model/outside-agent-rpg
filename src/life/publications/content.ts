import type {Life} from '../types';
import type {Content} from '../../cognition/types';
import type {ReadingProfile} from '../reading-threads/types';
import {publications} from './profile';
import {libraryFor} from '../reading';
import {validatePublications} from './rules';
import {parseSemantic} from '../semantic-content';

export function withPublications(base:Content,reading:ReadingProfile,version:Life['contentVersion']='0.15.0'):Content {
  const c=structuredClone(base);
  // Its source is no longer available in new runs; retain the other three replies.
  const d=c.nodes.find(n=>n.id==='pg_e13')!;d.choices=d.choices.filter(x=>x.id!=='pg_e13_witness');
  validatePublications(publications,c,reading,libraryFor(version).entries);
  if(c.semantic!.topics.branch_publications)throw new Error('发布语义主题重复。');
  c.semantic!.topics.branch_publications='支线中的公开往来';
  for(const post of publications.posts){
    const key='reading:'+post.id;if(c.semantic!.sources[key])throw new Error('发布语义来源重复。');
    c.semantic!.sources[key]={topic:'branch_publications',depth:0,clauses:[{facet:'reading_'+post.id,gist:post.contextText,abstract:'一段公开往来留下了记录。',epistemic:'reported',priority:2,tags:['reading_'+post.id]}]};
  }
  c.semantic=parseSemantic(c.semantic);return c;
}
