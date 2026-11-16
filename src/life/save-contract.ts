import {readingProfile} from './reading-threads/profile';
/** Bump the rule ID when serialized outcomes change, even without a content bump. */
export const CURRENT_CONTENT_VERSION='0.18.0' as const;
const productionId='outside-life-0.18-r1';
export const SAVE_CONTRACT={version:2 as const,contentVersion:CURRENT_CONTENT_VERSION,
 compatibilityId:readingProfile.id==='production'?productionId:`${productionId}-fixture-${readingProfile.id}`};
