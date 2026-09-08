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
 *
 * **"It never throws" is asserted by its effects, and an assertion has to be
 * the detector.** The engine's promise is kept inside listeners, and
 * `EventTarget.dispatchEvent` *reports* a listener's exception rather than
 * propagating it, so `expect(() => target.dispatchEvent(...)).not.toThrow()`
 * passes over a listener that certainly threw. Vitest's unhandled-error channel
 * does see it and does exit non-zero, and for a long time that was what the
 * `K2` mutation entry "a failed construction is rethrown instead of swallowed"
 * relied on. **It is not enough**, measured: with that mutation applied the run
 * prints `Test Files 56 passed (56)` beside `Errors 3 errors`, and the mutation
 * harness requires a gate to print its own verdict before it will record a
 * detection, so the entry stopped the sweep rather than being caught by it. So
 * every "never throws" arm below states what the engine **did** after the
 * gesture, and the two that answer a refused context assert that it also let go
 * of the page, which is the effect a rethrow skips. Nobody should re-introduce
 * the `not.toThrow` shape, nobody should rely on the unhandled channel as an
 * entry's only detector, and nobody should turn
 * `dangerouslyIgnoreUnhandledErrors` on without reading this paragraph.
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

/**
 * The same page, recording which listeners the engine took off it.
 *
 * The engine's answer to a platform that cannot give it a context is to let go
 * of the page, and letting go is an absence: nothing about a later gesture
 * looks different from the outside. So the removals are recorded, which also
 * makes the "never throws" law visible to an assertion rather than only to
 * vitest's unhandled-error channel: a construction that rethrows never reaches
 * the release, and `Test Files ... passed` is what that channel prints.
 */
class WatchedFakePage extends FakePage {
  readonly removed: string[] = [];

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this.removed.push(type);
    super.removeEventListener(type, listener, options);
  }
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
    const page = new WatchedFakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => {
        throw new Error('no audio on this platform');
      },
    });
    page.dispatchEvent(new Event('pointerdown'));
    // The effect, not the absence of a throw: the gesture ran, the engine gave
    // up on the context, and it still answers every later call.
    expect(engine.started()).toBe(true);
    engine.cue('win', 'roundResult');
    expect(engine.offered().win).toBe(1);
    // And it let go of the page in the same handler. This is the assertion the
    // rethrow has to fail: a construction that raised out of the gesture never
    // reached the release, and an exception escaping a listener is reported by
    // the runner rather than propagated, so nothing else here would notice.
    expect([...page.removed].sort(), 'the engine kept listening for a gesture it cannot use').toEqual(
      ['keydown', 'pointerdown'],
    );
  });

  it('stays silent, rather than thrown, over a platform with no constructor', () => {
    const page = new WatchedFakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => null,
    });
    page.dispatchEvent(new Event('keydown'));
    expect(engine.started()).toBe(true);
    engine.cue('blackjack', 'roundResult');
    expect(engine.offered().blackjack).toBe(1);
    expect([...page.removed].sort()).toEqual(['keydown', 'pointerdown']);
  });

  it('constructs on the first gesture only, and takes every listener off at dispose', () => {
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

    // And the once half, live: after the first gesture answers, later gestures
    // construct nothing at all.
    //
    // **They do still ask the context to run, and that is `AUDIT-2`'s finding
    // `J6-01`.** The listeners used to come off inside the first gesture of any
    // kind, which spent the engine's one attempt on a press the platform may
    // not have counted as an activation and left no way back. What is once here
    // is the construction; the asking runs until the platform reports a running
    // context, which the stand-in below never does. The releasing half is
    // asserted in "stops listening once the context is running".
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
    expect(liveContext.constructed).toBe(1);
    expect(liveContext.resumed).toBe(3);
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
    page.dispatchEvent(new Event('pointerdown'));
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
    page.dispatchEvent(new Event('visibilitychange'));
    expect(engine.started()).toBe(true);
    engine.cue('win', 'roundResult');
    expect(engine.offered().win).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// A context the platform will not run. `AUDIT-2`, findings `J6-01` and `X4-02`
// ---------------------------------------------------------------------------

/**
 * A context that constructs, wires up, and then dies. `AUDIT-2`, `X4-02`.
 *
 * The Web Audio specification requires a closed context to throw
 * `InvalidStateError` from every factory method, which is what a platform
 * closing contexts under memory pressure, a page the back/forward cache handed
 * back without its context, and an audio-service crash all look like from
 * inside the page. Everything works until `kill()`, so the engine reaches the
 * state a live session is in before anything refuses.
 */
class DyingContext extends RecordingAudioContext {
  private dead = false;

  kill(): void {
    this.dead = true;
  }

  private refuseWhenDead(): void {
    if (this.dead) {
      throw new Error('InvalidStateError: AudioContext is closed');
    }
  }

  override createGain(): unknown {
    this.refuseWhenDead();
    return super.createGain();
  }

  override createOscillator(): unknown {
    this.refuseWhenDead();
    return super.createOscillator();
  }

  override createBuffer(channels: number, length: number): unknown {
    this.refuseWhenDead();
    return super.createBuffer(channels, length);
  }

  override createBufferSource(): unknown {
    this.refuseWhenDead();
    return super.createBufferSource();
  }
}

/**
 * A context that constructs and then refuses to be wired to a destination.
 * `AUDIT-2`, finding `Z5-02`.
 *
 * The three statements after the guarded construction, `createGain`, the gain
 * write and `connect`, were outside the engine's one `try`. This refuses the
 * last of them, which is the one that leaves a master gain built and attached
 * to nothing: an engine that kept it would schedule every later cue into a
 * graph with no output.
 */
class UnconnectableContext extends RecordingAudioContext {
  override createGain(): unknown {
    const node = super.createGain() as { connect: () => void };
    node.connect = (): void => {
      throw new Error('connect refused');
    };
    return node;
  }
}

describe('K2: a context the platform will not run is retried, not abandoned', () => {
  it('keeps listening while the context is not running, and asks again', () => {
    // `AUDIT-2`, finding `J6-01`. The engine spent its one start on the first
    // gesture of any kind and never asked again, so a context the platform
    // declined to run was a permanently silent game that every instrument, the
    // mute control included, reported as sounding.
    const page = new FakePage();
    const context = new RecordingAudioContext();
    createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    expect(context.constructed).toBe(1);
    expect(context.resumed).toBe(1);

    // The platform did not run it. The next press is the retry the design
    // assumed the first press would never need, and it constructs nothing.
    page.dispatchEvent(new Event('keydown'));
    expect(context.constructed).toBe(1);
    expect(context.resumed).toBe(2);
  });

  it('stops listening once the context is running', () => {
    // The other side of the same rule, and the reason this is a retry rather
    // than a listener the game keeps for ever: the moment the platform reports
    // a running context there is nothing left for a gesture to do.
    const page = new FakePage();
    const context = new RecordingAudioContext();
    createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    context.state = 'running';
    page.dispatchEvent(new Event('keydown'));
    page.dispatchEvent(new Event('pointerdown'));
    expect(context.resumed).toBe(1);
  });

  it('stops listening when there is no context to run at all', () => {
    // A platform with no constructor, and a constructor that threw, are both
    // answers no later gesture can improve on. The engine lets go of the page.
    let calls = 0;
    const page = new FakePage();
    createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => {
        calls += 1;
        return null;
      },
    });
    page.dispatchEvent(new Event('pointerdown'));
    page.dispatchEvent(new Event('keydown'));
    page.dispatchEvent(new Event('pointerdown'));
    expect(calls).toBe(1);
  });

  it('asks a suspended context to run when a cue is offered, and a running one never', () => {
    // The retry the player cannot be relied on to make: a session that started
    // with one press and then played by clicking controls offers cues without
    // producing another `pointerdown` on the document until the next press.
    const { engine, context } = startedEngine();
    const before = context.resumed;
    engine.cue('cardDeal', 'dealing');
    expect(context.resumed).toBe(before + 1);
    expect(engine.offered().cardDeal).toBe(1);

    context.state = 'running';
    engine.cue('cardDeal', 'dealing');
    expect(context.resumed).toBe(before + 1);
    expect(engine.offered().cardDeal).toBe(2);
  });
});

describe('K2: a subsystem that fails after it started degrades to silence', () => {
  it('answers a cue on a context that died under it', () => {
    // `AUDIT-2`, finding `X4-02`. `cue()` is offered from inside the frame
    // callback, which is the one thing the composition root wraps in the error
    // boundary, so an unguarded throw here is not silence: it is the full-page
    // recovery panel, the shell removed and the round lost, for an optional
    // subsystem. QUALITY-BAR section 12: "a missing or failing subsystem
    // degrades".
    const context = new DyingContext();
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    engine.cue('cardDeal', 'dealing');
    expect(context.voices.length).toBeGreaterThan(0);

    context.kill();
    // Every cue, both branches: the oscillator voices and the percussive ones
    // cut from the shared noise buffer.
    for (const cue of CUE_IDS) {
      expect(() => {
        engine.cue(cue, 'roundResult');
      }, cue).not.toThrow();
    }
    // The tally is the emission record and still counts the offer, which is
    // what item `K5`'s "exactly once" is a claim about.
    expect(engine.offered().win).toBe(1);
    expect(engine.offered().shuffle).toBe(1);
  });

  it('drops a context that refused to be wired, rather than playing into it', () => {
    // `AUDIT-2`, finding `Z5-02`. The engine's own header states the law as
    // "every entry point below answers rather than raising", and the `try`
    // covered only the constructor call. A refused `connect` left a master gain
    // attached to nothing and a graph the engine went on scheduling into.
    const context = new UnconnectableContext();
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    expect(engine.started()).toBe(true);

    expect(() => {
      engine.cue('win', 'roundResult');
    }).not.toThrow();
    // Nothing was built on the dead graph at all, which is the sharp reading:
    // the envelope's first gain write happens **before** the connect that
    // refuses, so an engine that kept its half-built master would leave that
    // write behind even though no voice ever started.
    expect(context.gainWrites, 'wrote into a graph with no output').toHaveLength(0);
    expect(context.voices, 'scheduled into a graph with no output').toHaveLength(0);
    expect(engine.offered().win).toBe(1);
  });

  it('answers a cue on a context whose resume throws rather than rejects', () => {
    // `AUDIT-2`, finding `Z5-02`, the other unguarded call. `resume()` is
    // specified to return a promise, so the engine's `.catch` answers a
    // rejection and never a synchronous throw; a platform outside that contract
    // took the whole frame callback with it, and the frame callback is what the
    // error boundary wraps.
    const context = new RecordingAudioContext();
    context.resume = (): Promise<void> => {
      throw new Error('resume refused');
    };
    const page = new FakePage();
    const engine = createAudioEngine({
      listeners: page,
      visibility: page,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    expect(engine.started()).toBe(true);
    // The cue asks a context that is not running to run, so the refusal is on
    // the path every cue takes and not only on the first gesture's.
    expect(() => {
      engine.cue('win', 'roundResult');
    }).not.toThrow();
    expect(engine.offered().win).toBe(1);
    // And it still played: a refused resume is silence at worst, not a cue the
    // engine declined to schedule.
    expect(context.voices.length).toBeGreaterThan(0);
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

  /**
   * The one input `Math.min(MAX, Math.max(MIN, value))` answers outside its own
   * range. `AudioParam.value` is a WebIDL restricted float, so a `NaN` reaching
   * the master gain is a `TypeError` thrown inside the first-gesture handler,
   * which is inside the one function this module promises never throws; the
   * stand-in's gain setter is as strict as the real one so that this test can
   * see it. Nothing reachable produces a non-finite volume today, and that is
   * the point: the promise should not rest on the engine's two callers.
   */
  it('clamps a non-finite volume rather than answering with it', () => {
    const page = new FakePage();
    const context = new RecordingAudioContext();
    const engine = createAudioEngine({
      volume: Number.NaN,
      listeners: page,
      visibility: page,
      contextFactory: () => context as unknown as AudioContext,
    });
    page.dispatchEvent(new Event('pointerdown'));
    expect(engine.started()).toBe(true);
    expect(engine.volume()).toBe(DEFAULT_VOLUME);
    expect(context.master?.gain.value).toBe(DEFAULT_VOLUME);

    engine.setVolume(Number.NaN);
    expect(engine.volume()).toBe(DEFAULT_VOLUME);
    expect(context.master?.gain.value).toBe(DEFAULT_VOLUME);

    // The control: every finite value, both infinities included, clamps as the
    // contract says, so the guard above is one hole rather than a broken clamp.
    engine.setVolume(Number.POSITIVE_INFINITY);
    expect(engine.volume()).toBe(MAX_VOLUME);
    engine.setVolume(Number.NEGATIVE_INFINITY);
    expect(engine.volume()).toBe(MIN_VOLUME);
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
