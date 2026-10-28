import type {Life} from '../types';
import {readingProfile} from './profile';
import {production15} from './production-0.15';
import type {ReadingProfile} from './types';

const empty14:ReadingProfile={id:'production',threads:[],nodes:[],semantic:{topics:{},sources:{}}};

/** The fixture override remains a separate build, never a production save profile. */
export const profileFor=(version:Life['contentVersion']) =>
  readingProfile.id!=='production'&&(!readingProfile.fixtureVersion||readingProfile.fixtureVersion===version)?readingProfile:
  version==='0.15.0'?production15:empty14;
