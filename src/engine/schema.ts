import Ajv, { type ErrorObject } from 'ajv';
import definitions from '../../schemas/definitions.schema.json';
import eventSchema from '../../schemas/event.schema.json';
import manifestSchema from '../../schemas/manifest.schema.json';
import gameStateSchema from '../../schemas/game-state.schema.json';
import saveFileSchema from '../../schemas/save-file.schema.json';
import type { GameState, SaveFile, StoryEvent, StoryManifest } from './types';

const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addFormat('date-time', {
  type: 'string',
  validate: (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)),
});
ajv.addSchema(definitions);
const eventValidator = ajv.compile<StoryEvent>(eventSchema);
const manifestValidator = ajv.compile<StoryManifest>(manifestSchema);
const stateValidator = ajv.compile<GameState>(gameStateSchema);
const saveValidator = ajv.compile<SaveFile>(saveFileSchema);

function explain(source: string, errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((error) => {
    const field = error.keyword === 'required' ? `/${String(error.params.missingProperty)}` : '';
    return `${source}${error.instancePath || ''}${field}: ${error.message ?? 'invalid data'}`;
  }).join('\n');
}

export function validateStoryEvent(value: unknown, source = 'event'): asserts value is StoryEvent {
  if (!eventValidator(value)) throw new Error(explain(source, eventValidator.errors));
}

export function validateManifest(value: unknown, source = 'manifest'): asserts value is StoryManifest {
  if (!manifestValidator(value)) throw new Error(explain(source, manifestValidator.errors));
}

export function validateGameState(value: unknown): asserts value is GameState {
  if (!stateValidator(value)) throw new Error(explain('state', stateValidator.errors));
}

export function validateSaveFile(value: unknown): asserts value is SaveFile {
  if (!saveValidator(value)) throw new Error(explain('save', saveValidator.errors));
}
