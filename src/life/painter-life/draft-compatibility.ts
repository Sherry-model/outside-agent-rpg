import type {Content} from '../../cognition/types';

/** Only for authenticating the unpublished 63d0b34 candidate's save snapshots.
 * Never used as playable content. The two edits affect retained text, so old
 * snapshots must pass their own strict replay before being regenerated.
 */
export function originalPainterDraft(content: Content): Content {
  return JSON.parse(JSON.stringify(content)
    .replaceAll('我读过画师的公共消息', '我和画师有过一些来往')
    .replaceAll('它切了一下图，又回去画手', '它切了一下图，又回去画手。这是它现在给你的纠正')) as Content;
}
