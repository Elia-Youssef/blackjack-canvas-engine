/**
 * The two live regions, and the one queue that writes them. `BJ-18`, item `G4`
 * (Critical), and QUALITY-BAR section 4's second mechanism.
 *
 *   "Live regions for change. `aria-live="polite"` for incremental changes,
 *    `aria-live="assertive"` reserved for round and match outcomes. This
 *    satisfies 4.1.3."
 *
 * **This is not the mirror and cannot stand in for it.** The section says a live
 * region "cannot be navigated, re-read or queried", which is the whole reason
 * `src/ui/components/mirror.ts` exists beside this file. Nothing here is
 * navigable and nothing here persists: each region holds the last thing said and
 * is otherwise empty. Item `G4` is failed by a part that builds one of the two
 * and claims both.
 *
 * **Both region elements exist from the moment the chrome does, and only their
 * text ever changes.** That is QUALITY-BAR section 4's "exist in the initial
 * HTML" clause, read against a chrome that is built in TypeScript: the purpose
 * of the clause is that a region is present in the accessibility tree before
 * anything is written into it, because a region that arrives with its text
 * already inside it is announced by nothing. So the two elements are created
 * here, empty, mounted with the rest of the chrome, and never replaced; the
 * first announcement of a session is a later frame's, and `announce.ts` says why
 * the first frame deliberately says nothing at all.
 *
 * **The regions are written unconditionally, which is the one place in this
 * chrome that `setText`'s guard would be wrong.** Everywhere else a write of the
 * value already on screen is waste; here it is the event. Two identical
 * refusals in a row are two refusals, and a region that skipped the second
 * because the string matched would be silent about the one the player is waiting
 * to hear.
 *
 * **The queue's clock is the frame's raw `dt`.** Not the motion policy's and not
 * Speed's; `announce.ts` carries that reading and the reasoning behind it.
 */

import {
  announcementsFor,
  createAnnouncementQueue,
  type AnnounceFrame,
  type Announcement,
  type AnnouncementQueue,
  type QueueState,
} from '../announce';
import { el } from '../dom';
import type { ChromeState, Component } from '../state';

/** What a spec and the accessibility probe may ask the announcer. */
export interface Announcer extends Component {
  /** The last thing written to each region, or `null` where nothing has been. */
  spoken(): { readonly polite: string | null; readonly assertive: string | null };
  /** What the queue is holding right now. */
  queue(): QueueState;
}

/** Build the two regions. Nothing is announced until something changes. */
export function createAnnouncer(): Announcer {
  // `aria-atomic="true"` so a region is read as one message rather than as the
  // words that differ from the previous one, which is what a diffing screen
  // reader does to a region whose text is replaced wholesale.
  const polite = el('p', {
    attributes: {
      'aria-live': 'polite',
      'aria-atomic': 'true',
      'data-live': 'polite',
    },
  });
  const assertive = el('p', {
    attributes: {
      'aria-live': 'assertive',
      'aria-atomic': 'true',
      'data-live': 'assertive',
    },
  });

  // The container is what is hidden, not the two regions themselves: one clipped
  // box rather than three, and the regions stay ordinary elements whose only
  // distinguishing feature is the ARIA on them.
  const root = el('div', {
    className: 'bj-live bj-visually-hidden',
    attributes: { 'data-live': 'regions' },
    children: [polite, assertive],
  });

  const queue: AnnouncementQueue = createAnnouncementQueue();
  let previous: AnnounceFrame | null = null;
  let lastPolite: string | null = null;
  let lastAssertive: string | null = null;

  function write(announcement: Announcement): void {
    if (announcement.priority === 'assertive') {
      lastAssertive = announcement.text;
      assertive.textContent = announcement.text;
      return;
    }
    lastPolite = announcement.text;
    polite.textContent = announcement.text;
  }

  return {
    root,
    update(state: ChromeState, dt: number): void {
      const frame: AnnounceFrame = {
        readout: state.readout,
        context: { notice: state.notice, milestones: state.milestones },
      };
      for (const announcement of announcementsFor(previous, frame)) {
        queue.push(announcement);
      }
      previous = frame;

      const due = queue.tick(dt);
      if (due !== null) {
        write(due);
      }
    },
    spoken: () => ({ polite: lastPolite, assertive: lastAssertive }),
    queue: () => queue.state(),
  };
}
