/**
 * The audio engine's own rules. `BJ-19`, items `K2` and `K3`.
 *
 * Every clause of QUALITY-BAR section 10 that a headless runner can see is
 * here, driven through the injected platform in the `motion.ts` pattern: the
 * context factory, the gesture surface, the visibility surface and the audio
 * session are all handed in, so each branch of each feature test is reached by
 * construction rather than by hoping the runner has the platform the clause
 * is about. What this file cannot see is the real browser's side of the
 * autoplay policy, which is `tests/browser/audio-start.spec.ts`'s half: there
 * the page's own `AudioContext` is wrapped before anything loads.
 */

import { describe, expect, it } from 'vitest';

import {
  CUE_IDS,
  DEFAULT_MUTED,
  DEFAULT_VOLUME,
  MAX_VOLUME,
  MIN_VOLUME,
  createAudioEngine,
  type AudioEngine,
  type AudioSessionTarget,
} from '../../src/ui/audio';
import * as documentConstants from '../../src/storage/document';
import { RecordingAudioContext } from './support/audio-context';

/** A page-shaped target, with a visibility state a test can set. */
class FakePage extends EventTarget {
  visibilityState = 'visible';
}

/** One engine over one recording context, already started by a gesture. */
function startedEngine(
  options: Partial<Parameters<typeof createAudioEngine>[0]> = {},
): { engine: AudioEngine; context: RecordingAudioContext } {
  const context = new RecordingAudioContext();
  const page = new FakePage();
  const engine = createAudioEngine({
    listeners: page,
    visibility: page,
    contextFactory: () => context as unknown as AudioContext,
    ...options,
  });
  page.dispatchEvent(new Event('pointerdown'));
  return { engine, context };
}

describe('K2: no context exists before the first user gesture', () => {
  it('constructs nothing at creation, and asks for nothing while idle', () => {
    let constructions = 0;
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => {
        constructions += 1;
        return new RecordingAudioContext() as unknown as AudioContext;
      },
    });
    expect(engine.started()).toBe(false);
    expect(constructions).toBe(0);
    // A cue offered before any gesture is tallied and nothing else happens,
    // which is the autoplay policy's own shape: no output path exists.
    engine.cue('buttonPress', 'betting');
    expect(engine.offered().buttonPress).toBe(1);
    expect(constructions).toBe(0);
  });

  it('constructs exactly once, inside the pointer gesture, and resumes there', () => {
    const { engine, context } = startedEngine();
    expect(engine.started()).toBe(true);
    expect(context.constructed).toBe(1);
    expect(context.resumed).toBe(1);
  });

  it('constructs exactly once through a key gesture alone', () => {
    const context = new RecordingAudioContext();
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('keydown'));
    expect(engine.started()).toBe(true);
    expect(context.constructed).toBe(1);
  });

  it('hears only the first gesture, whichever kind it was', () => {
    let calls = 0;
    const page = new FakePage();
    createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => {
        calls += 1;
        return new RecordingAudioContext() as unknown as AudioContext;
      },
    });
    page.dispatchEvent(new Event('pointerdown'));
    page.dispatchEvent(new Event('keydown'));
    page.dispatchEvent(new Event('pointerdown'));
    expect(calls).toBe(1);
  });

  it('never throws when the context cannot be created, and stays silent', () => {
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => {
        throw new Error('no audio on this platform');
      },
    });
    expect(() => page.dispatchEvent(new Event('pointerdown'))).not.toThrow();
    expect(engine.started()).toBe(true);
    engine.cue('win', 'roundResult');
    expect(engine.offered().win).toBe(1);
  });

  it('stays silent, rather than thrown, over a platform with no constructor', () => {
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => null,
    });
    expect(() => page.dispatchEvent(new Event('keydown'))).not.toThrow();
    engine.cue('blackjack', 'roundResult');
    expect(engine.offered().blackjack).toBe(1);
  });

  it('takes its gesture listeners off once one has fired, and all of them off at dispose', () => {
    let calls = 0;
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => {
        calls += 1;
        return new RecordingAudioContext() as unknown as AudioContext;
      },
    });
    engine.dispose();
    page.dispatchEvent(new Event('pointerdown'));
    page.dispatchEvent(new Event('keydown'));
    expect(engine.started()).toBe(false);
    expect(calls).toBe(0);

    // And the once half, live: after the first gesture answers, later
    // gestures construct nothing, because the listeners are gone rather than
    // merely quiet.
    const live = new FakePage();
    const liveContext = new RecordingAudioContext();
    createAudioEngine({
      listeners: live,
      visibility: live,
      contextFactory: () => {
        calls += 1;
        return liveContext as unknown as AudioContext;
      },
    });
    live.dispatchEvent(new Event('pointerdown'));
    live.dispatchEvent(new Event('keydown'));
    live.dispatchEvent(new Event('pointerdown'));
    expect(calls).toBe(1);
    expect(liveContext.resumed).toBe(1);
  });
});

describe('K2: the iOS session is routed once, behind the feature test', () => {
  it('writes playback exactly once, in the first-gesture handler', () => {
    // A counting setter, so "once" is enforced rather than implied: the
    // engine's whole once-story is that the gesture handler runs a single
    // time, and this counts the writes that handler made.
    let writes = 0;
    let type = 'ambient';
    const session = {
      get type(): string {
        return type;
      },
      set type(value: string) {
        writes += 1;
        type = value;
      },
    } as AudioSessionTarget;
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      audioSession: session,
      contextFactory: () => new RecordingAudioContext() as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    page.dispatchEvent(new Event('keydown'));
    page.dispatchEvent(new Event('pointerdown'));
    expect(session.type).toBe('playback');
    expect(writes).toBe(1);
    expect(engine.started()).toBe(true);
  });

  it('writes nothing at all where the platform has no session', () => {
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      audioSession: null,
      contextFactory: () => new RecordingAudioContext() as unknown as AudioContext,
    });
    expect(() => page.dispatchEvent(new Event('pointerdown'))).not.toThrow();
    expect(engine.started()).toBe(true);
  });

  it('writes nothing before a gesture', () => {
    const session: AudioSessionTarget = { type: 'ambient' };
    const page = new FakePage();
    createAudioEngine({ listeners: page, visibility: page, audioSession: session });
    expect(session.type).toBe('ambient');
  });
});

describe('K2: the context is resumed again when the page becomes visible', () => {
  it('resumes on visible, and only on visible', () => {
    const page = new FakePage();
    const context = new RecordingAudioContext();
    createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    expect(context.resumed).toBe(1);

    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    expect(context.resumed).toBe(1);

    page.visibilityState = 'visible';
    page.dispatchEvent(new Event('visibilitychange'));
    expect(context.resumed).toBe(2);
  });

  it('does nothing on a page that never made a context', () => {
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => {
        throw new Error('unavailable');
      },
    });
    page.dispatchEvent(new Event('pointerdown'));
    expect(() => page.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
    expect(engine.started()).toBe(true);
  });
});

describe('K3: persisted mute and volume, applied at creation and live after', () => {
  it('applies the defaults at creation', () => {
    expect(DEFAULT_MUTED).toBe(false);
    expect(DEFAULT_VOLUME).toBe(MAX_VOLUME);
    const { context } = startedEngine();
    expect(context.master?.gain.value).toBe(DEFAULT_VOLUME);
  });

  it('applies a restored mute at creation, so a muted session stays muted', () => {
    const { engine, context } = startedEngine({ muted: true });
    expect(engine.muted()).toBe(true);
    expect(context.master?.gain.value).toBe(MIN_VOLUME);
  });

  it('applies a restored volume at creation', () => {
    const { engine, context } = startedEngine({ volume: 0.4 });
    expect(engine.volume()).toBe(0.4);
    expect(context.master?.gain.value).toBeCloseTo(0.4, 12);
  });

  it('clamps whatever volume arrives', () => {
    const high = startedEngine({ volume: 4 });
    expect(high.engine.volume()).toBe(MAX_VOLUME);
    const low = startedEngine({ volume: -2 });
    expect(low.engine.volume()).toBe(MIN_VOLUME);
  });

  it('moves the master live when the mute or the volume changes', () => {
    const { engine, context } = startedEngine();
    engine.setMuted(true);
    expect(context.master?.gain.value).toBe(MIN_VOLUME);
    engine.setMuted(false);
    expect(context.master?.gain.value).toBe(DEFAULT_VOLUME);
    engine.setVolume(0.25);
    expect(context.master?.gain.value).toBeCloseTo(0.25, 12);
    engine.setVolume(9);
    expect(engine.volume()).toBe(MAX_VOLUME);
  });
});

describe('K5 armour: the offer, the tally and the voices', () => {
  it('counts every offered cue, with every phase key, from zero', () => {
    const { engine } = startedEngine();
    const offered = engine.offered();
    expect(Object.keys(offered).sort()).toEqual([...CUE_IDS].sort());
    for (const cue of CUE_IDS) {
      expect(offered[cue]).toBe(0);
    }
    expect(engine.offeredInPhase()).toEqual({});
  });

  it('counts an offer whether or not anything was audible', () => {
    const page = new FakePage();
    const muted = createAudioEngine({ listeners: page, visibility: page, muted: true });
    muted.cue('win', 'roundResult');
    expect(muted.offered().win).toBe(1);
    expect(muted.offeredInPhase()['win@roundResult']).toBe(1);

    const silent = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => null,
    });
    silent.cue('shuffle', 'roundResult');
    expect(silent.offered().shuffle).toBe(1);
  });

  it('plays nothing while muted, and plays again the moment it is not', () => {
    const page = new FakePage();
    const context = new RecordingAudioContext();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      muted: true,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    engine.cue('win', 'roundResult');
    expect(context.voices).toHaveLength(0);
    engine.setMuted(false);
    engine.cue('win', 'roundResult');
    expect(context.voices.length).toBe(2);
  });

  it('generates the noise buffer once and reuses it for every percussive cue', () => {
    const { engine, context } = startedEngine();
    engine.cue('cardDeal', 'dealing');
    engine.cue('cardDeal', 'dealing');
    engine.cue('shuffle', 'roundResult');
    expect(context.buffersCreated).toBe(1);
  });

  it('synthesises every cue as scheduled voices at the current time', () => {
    const { engine, context } = startedEngine();
    for (const cue of CUE_IDS) {
      context.voices.length = 0;
      engine.cue(cue, 'betting');
      // Every cue has at least one voice, and nothing is scheduled in the
      // past: the engine's whole timing story is "now, plus offsets".
      expect(context.voices.length, cue).toBeGreaterThan(0);
      for (const voice of context.voices) {
        expect(voice.at, cue).toBeGreaterThanOrEqual(7.5);
      }
    }
    // And the shapes are distinct where the design says they are: a win is
    // two rising tones and a blackjack is three.
    context.voices.length = 0;
    engine.cue('win', 'roundResult');
    expect(context.voices.map((voice) => voice.frequency)).toEqual([523, 659]);
    context.voices.length = 0;
    engine.cue('blackjack', 'roundResult');
    expect(context.voices.map((voice) => voice.frequency)).toEqual([523, 659, 784]);
    context.voices.length = 0;
    engine.cue('cardDeal', 'dealing');
    expect(context.voices.map((voice) => voice.kind)).toEqual(['noise']);
  });
});

describe('K3: the persisted document takes its sound constants from the owner', () => {
  it('re-exports exactly what the audio module declares', () => {
    // The Speed precedent: the constants moved to the module that reads them
    // and the document re-exports them so no caller edits. This is the drift
    // guard; a second declaration in either file would fail it.
    expect(documentConstants.DEFAULT_MUTED).toBe(DEFAULT_MUTED);
    expect(documentConstants.MIN_VOLUME).toBe(MIN_VOLUME);
    expect(documentConstants.MAX_VOLUME).toBe(MAX_VOLUME);
    expect(documentConstants.DEFAULT_VOLUME).toBe(DEFAULT_VOLUME);
  });
});
