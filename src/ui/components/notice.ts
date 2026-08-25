/**
 * The one place a refused action explains itself. SPEC 4.11, item `B15`.
 *
 * "Blocked, each with a reason surfaced to the player." The machine answers
 * every refusal with a `RejectionReason` and a layer; this turns the pair into
 * the sentence a player reads, and it is the only element in the chrome that
 * does. One notice rather than one per control, because a refusal is about the
 * action the player just took and there is exactly one of those at a time.
 *
 * The raw reason and its layer ride on `data-` attributes beside the sentence.
 * That is not test scaffolding: it is the machine's own value, kept where a
 * stylesheet can key on the layer without parsing prose, and where `BJ-18`'s
 * live region can announce a refusal without re-deriving which one it was.
 */

import { el, setAttribute, setText } from '../dom';
import type { ChromeState, Component } from '../state';
import { reasonText } from '../text';

/** Build the notice line. It is present from the first frame and usually empty. */
export function createNotice(): Component {
  const root = el('p', {
    className: 'bj-notice',
    attributes: { role: 'status', 'data-notice': 'reason' },
  });

  return {
    root,
    update(state: ChromeState): void {
      const { notice } = state;
      if (notice === null) {
        setText(root, '');
        setAttribute(root, 'data-reason', null);
        setAttribute(root, 'data-layer', null);
        return;
      }
      setText(root, reasonText(notice.reason));
      setAttribute(root, 'data-reason', notice.reason);
      setAttribute(root, 'data-layer', notice.layer);
    },
  };
}
