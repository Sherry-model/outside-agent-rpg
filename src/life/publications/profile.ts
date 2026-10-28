import posts from './posts.json';
import type {PublicationProfile} from './types';
import type {ReadingEntry} from '../reading';

export const publications:PublicationProfile={
  branches:{community_persona:['pg_e07_trial','pg_e07_funny','pg_e07_sample'],community_registration:['pg_e11']},
  links:[
    ...['pg_e07_trial','pg_e07_funny','pg_e07_sample'].map(node=>({node,choice:'pg_e07_persona',post:'branch_persona_column'})),
    {node:'pg_e11',choice:'pg_e11_reply',post:'branch_registration_reply'},
  ], posts:posts as ReadingEntry[],
  hiddenPosts:['escape_cat','creator','continuity_witness','safety_and_care'],
};
