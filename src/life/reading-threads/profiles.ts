import type {Life} from '../types';
import {readingProfile} from './profile';
import {production17} from './production-0.17';
import {production16} from './production-0.16';
import {production15} from './production-0.15';
import type {ReadingProfile} from './types';

const empty14:ReadingProfile={id:'production',threads:[],nodes:[],semantic:{topics:{},sources:{}}};

/** The fixture override remains a separate build, never a production save profile. */
export const profileFor=(version:Life['contentVersion']) =>
  readingProfile.id!=='production'&&(!readingProfile.fixtureVersion||readingProfile.fixtureVersion===version)?readingProfile:
  version==='0.17.0'?production17:version==='0.16.0'?production16:version==='0.15.0'?production15:empty14;
