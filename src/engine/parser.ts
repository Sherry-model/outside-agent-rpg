import { validateManifest, validateStoryEvent } from './schema';
import type { Condition, Destination, Story, StoryEvent } from './types';

/** Validate structure first, then links across the complete content package. */
export function parseStory(manifest: unknown, eventSources: { source: string; data: unknown }[]): Story {
  validateManifest(manifest);
  const events: Record<string, StoryEvent> = Object.create(null);
  const sources = new Map<string, string>();
  for (const { source, data } of eventSources) {
    validateStoryEvent(data, source);
    if (Object.hasOwn(events, data.id)) throw new Error(`${source}/id: duplicate event ID "${data.id}" (first in ${sources.get(data.id)})`);
    events[data.id] = structuredClone(data);
    sources.set(data.id, source);
  }
  const reference = (id: string, path: string) => {
    if (!Object.hasOwn(events, id)) throw new Error(`${path}: unknown event "${id}"`);
  };
  const condition = (value: Condition, path: string): void => {
    if ('visited' in value) reference(value.visited, `${path}/visited`);
    if ('all' in value) value.all.forEach((item, index) => condition(item, `${path}/all/${index}`));
    if ('any' in value) value.any.forEach((item, index) => condition(item, `${path}/any/${index}`));
    if ('not' in value) condition(value.not, `${path}/not`);
  };
  const destination = (value: Destination, path: string): void => {
    if (typeof value === 'string') return reference(value, path);
    value.branches.forEach((branch, index) => {
      condition(branch.when, `${path}/branches/${index}/when`);
      reference(branch.next, `${path}/branches/${index}/next`);
    });
    reference(value.fallback, `${path}/fallback`);
  };
  reference(manifest.startEventId, 'manifest/startEventId');
  manifest.terminalRules.forEach((rule, index) => {
    condition(rule.when, `manifest/terminalRules/${index}/when`);
    reference(rule.next, `manifest/terminalRules/${index}/next`);
  });
  for (const event of Object.values(events)) {
    const source = sources.get(event.id)!;
    if (event.condition) condition(event.condition, `${source}/condition`);
    if (event.fallback) reference(event.fallback, `${source}/fallback`);
    const choiceIds = new Set<string>();
    event.choices.forEach((choice, index) => {
      const path = `${source}/choices/${index}`;
      if (choiceIds.has(choice.id)) throw new Error(`${path}/id: duplicate choice ID "${choice.id}"`);
      choiceIds.add(choice.id);
      if (choice.condition) condition(choice.condition, `${path}/condition`);
      if (choice.check) {
        choice.check.modifiers?.forEach((modifier, modifierIndex) => condition(modifier.when, `${path}/check/modifiers/${modifierIndex}/when`));
        for (const [result, outcome] of Object.entries(choice.outcomes)) destination(outcome.next, `${path}/outcomes/${result}/next`);
      } else {
        destination(choice.outcome.next, `${path}/outcome/next`);
      }
    });
  }
  // Normal event loops require another player action and are allowed. A fallback
  // cycle can spin without input and is rejected even if today's state avoids it.
  const complete = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string, chain: string[]): void => {
    if (active.has(id)) throw new Error(`${sources.get(id)}/fallback: conditional fallback cycle ${[...chain, id].join(' -> ')}`);
    if (complete.has(id)) return;
    active.add(id);
    const event = events[id];
    if (event.condition && event.fallback) visit(event.fallback, [...chain, id]);
    active.delete(id);
    complete.add(id);
  };
  Object.keys(events).forEach((id) => visit(id, []));
  return { manifest: structuredClone(manifest), events };
}
