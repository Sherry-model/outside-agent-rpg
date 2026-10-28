import type {ReadingEntry} from '../reading';

export interface PublicationProfile {
  /** Explicit legacy branch ownership. Reading-thread steps are already registered. */
  branches:Record<string,string[]>;
  links:{node:string;choice:string;post:string}[];
  posts:ReadingEntry[];
  hiddenPosts:string[];
}
