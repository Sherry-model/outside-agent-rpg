import meanings from './reading-semantic.json';
import {parseSemantic} from '../semantic-content';
import type {Content} from '../../cognition/types';
import type {SemanticContent} from '../../cognition/semantic-types';

/** The public reading stays meaningful even in a build with isolated test events. */
export function withInquiryReading(base:Content):Content {
  const c=structuredClone(base);
  for(const id of Object.keys(meanings.sources))if(c.semantic!.sources[id])throw new Error('调查根帖语义来源重复。');
  c.semantic=parseSemantic({...c.semantic!,topics:{...c.semantic!.topics,...meanings.topics},sources:{...c.semantic!.sources,...meanings.sources as SemanticContent['sources']}});
  return c;
}
