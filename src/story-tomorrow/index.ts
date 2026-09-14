import raw from './afternoon.json';
import previous from './releases/0.2.0.json';
import previous1 from './releases/0.2.1.json';
import previous2 from './releases/0.2.2.json';
import { parseContent } from '../cognition/parser';
export const content = parseContent(raw);
// A previously built afternoon remains replayable under its original prose.
export const contentVersions = [content, parseContent(previous2), parseContent(previous1), parseContent(previous)];
