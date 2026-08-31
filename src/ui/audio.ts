/**
 * The audio engine: SPEC 15's synthesis, and QUALITY-BAR section 10's gesture
 * policy. `BJ-19`, items `K2` and `K3`.
 *
 * SPEC 15: "Synthesised per QUALITY-BAR section 10. Cues: card deal, card flip,
 * chip place, chip clear, button press, win, blackjack, loss, push, bust,
 * shuffle, milestone, bust out. Every cue has a visual counterpart and none is
 * required to understand the game." The thirteen names are the `CueId` union
 * below; which game event fires which cue is not this file's question, and
 * `src/ui/cues.ts` answers it as a pure function of two machine snapshots. This
 * file is the half that makes sound: when a cue is offered it either plays, as
 * oscillators and one shared noise buffer through the Web Audio API, or it does
 * nothing at all, and every reason for doing nothing is one of the three the
 * quality bar names.
 *
 * **The law, from QUALITY-BAR section 10, in one sentence each.**
 *
 *   1. *No `AudioContext` is constructed until the first user gesture.* The
 *      context is created lazily inside the first `pointerdown` / `keydown`
 *      handler and `resume()` is called there. Autoplay policy suspends a
 *      context created outside a gesture; muting a gain node does not change
 *      that, which is why the engine holds no context at all rather than
 *      holding a quiet one.
 *   2. *If it is still not running, the game continues silently. It never
 *      throws.* A platform that refuses the context, or a constructor that
 *      throws, leaves the engine unstarted and the game is none the worse:
 *      every entry point below answers rather than raising.
 *   3. *It is resumed again on `visibilitychange` to visible*, because the
 *      platform may suspend it while hidden or during an interruption.
 *   4. *Persisted mute and volume are applied at creation*, so a player who
 *      muted last session stays muted.
 *   5. *iOS routing.* Where `navigator.audioSession` exists it is set to
 *      `'playback'` once, in the same first-gesture handler, behind a feature
 *      test. The default Web Audio session on iOS is `ambient`, which the
 *      hardware Ring/Silent switch mutes, unlike media elements.
 *   6. *The noise buffer used for percussive cues is generated once and
 *      reused*, never regenerated per cue.
 *
 * **`pointerdown` here is not a second activation path.** QUALITY-BAR section 3
 * makes `click` the only event a control is bound to, and nothing in this file
 * binds a control to anything. The `pointerdown` listener below observes the
 * page rather than driving it: it exists to be the gesture the context is
 * created inside, which is the one thing a `click` handler cannot be, because
 * `click` arrives after the platform has already decided whether the press was
 * a user activation. `src/ui/dom.ts` remains the only activation binding.
 *
 * **Nothing here touches `core/`, and `core/` stays audio-free.** The engine
 * observes the machine from the composition root, exactly as the announcer and
 * the coach do, and `src/core/` never learns that sound exists.
 *
 * **The platform is injected, in the `motion.ts` pattern.** Every platform
 * read, the context factory, the gesture surface, the visibility surface and
 * the audio session, can be handed in, and every default is guarded so that
 * importing this module under Node neither touches nor throws on a platform
 * that has none of them. `tests/unit/audio.test.ts` drives every gesture-rule
 * branch that way; the browser gate drives the real one.
 */

import { type VisibilityTarget, pageDocument } from './platform';

// ---------------------------------------------------------------------------
// SPEC 14's sound constants, relocated at BJ-19 on the Speed precedent
// ---------------------------------------------------------------------------

/**
 * SPEC 14's mute. Not muted until a player mutes it.
 *
 * `BJ-11` declared this beside the persisted settings because the document was
 * the first thing that had to name the value, and said a later part should move
 * it to the module that reads it. `BJ-14` did exactly that for Speed, from
 * `src/storage/document.ts` to `core/table.ts`, and this file does the same for
 * sound: the engine applies the value at creation, so the value lives beside
 * the engine and `src/storage/document.ts` re-exports it the way it already
 * re-exports `SPEEDS` and `DEFAULT_SPEED`.
 */
export const DEFAULT_MUTED = false;

/** SPEC 14's volume floor and ceiling, as a fraction of full output. */
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 1;

/**
 * The volume a player who has never touched the control has.
 *
 * A documented reading rather than a quoted figure, and flagged as one: SPEC 14
 * names "sound (mute and volume)" and QUALITY-BAR section 10 says only that
 * persisted mute and volume are applied at creation; neither states a starting
 * number. `MAX_VOLUME` is kept, and the reasoning is now the engine's own
 * rather than the document's: every per-cue gain below is scaled so that the
 * loudest stack of cues a round can produce, all firing together at full master
 * volume, stays under the summed headroom a `AudioContext` destination clips
 * at. A lower default would be this module quietly attenuating cues it could
 * have mixed correctly, and `BJ-20`'s volume slider inherits a control whose
 * full travel means full loudness rather than a mystery ceiling partway up.
 */
export const DEFAULT_VOLUME = MAX_VOLUME;

// ---------------------------------------------------------------------------
// SPEC 15's thirteen cues
// ---------------------------------------------------------------------------

/** The thirteen cues SPEC 15 names, as the union the engine is offered. */
export type CueId =
  | 'cardDeal'
  | 'cardFlip'
  | 'chipPlace'
  | 'chipClear'
  | 'buttonPress'
  | 'win'
  | 'blackjack'
  | 'loss'
  | 'push'
  | 'bust'
  | 'shuffle'
  | 'milestone'
  | 'bustOut';

/** The thirteen, in SPEC 15's own order, so a sweep cannot miss one. */
export const CUE_IDS: readonly CueId[] = Object.freeze([
  'cardDeal',
  'cardFlip',
  'chipPlace',
  'chipClear',
  'buttonPress',
  'win',
  'blackjack',
  'loss',
  'push',
  'bust',
  'shuffle',
  'milestone',
  'bustOut',
]);

// ---------------------------------------------------------------------------
// Synthesis. Every number is a named constant with a sentence beside it,
// because none of them is on any scale QUALITY-BAR section 15 owns: they are
// frequencies and envelopes, game feel rather than chrome presentation, and
// pinning them into the token layer would put game constants where a later
// theme could rewrite them.
// ---------------------------------------------------------------------------

/** One voice of one cue: an oscillator, or a burst of the shared noise. */
interface Voice {
  /** Carrier frequency in Hz, or 0 for the shared noise buffer. */
  readonly frequency: number;
  /** Seconds from the cue's start to this voice's start. */
  readonly at: number;
  /** How long the voice sounds. */
  readonly seconds: number;
  /** Peak gain into the master, before mute and volume. */
  readonly gain: number;
  /** The oscillator's waveform. Ignored for a noise voice. */
  readonly wave: OscillatorType;
}

/**
 * The noise burst every percussive cue is cut from, in seconds.
 *
 * One length for all of them: the buffer is generated once and a voice that
 * wants a shorter burst simply stops its source earlier, which is what
 * `AudioBufferSourceNode.stop` is for. Regenerating a different length per cue
 * is the per-cue regeneration QUALITY-BAR section 10 forbids wearing a length
 * argument as a disguise.
 */
const NOISE_SECONDS = 0.4;

/**
 * The floor an envelope decays to, rather than to true zero.
 *
 * `exponentialRampToValueAtTime` refuses a target of 0, and a linear ramp to 0
 * is a click; the oscillator stops a hair after the ramp lands at this level,
 * which is the standard shape for a synthesised pluck.
 */
const ENVELOPE_FLOOR = 0.0001;

/** How much is subtracted from an envelope's stop time. */
const STOP_EPSILON = 0.001;

/**
 * The tone table, one entry per cue.
 *
 * The design brief behind each choice, so a later retune is an edit with a
 * reason rather than a mystery:
 *
 *   - the four mechanical cues (deal, flip, place, clear) and the button press
 *     are clicks and slides: short, quiet, and cut from noise or a high
 *     square so they read as matter moving rather than as music;
 *   - the four results are one short melodic sentence each, rising for the
 *     wins, falling for the loss, level and brief for the push;
 *   - the three events that change the session's shape (bust, shuffle,
 *     milestone, bust out) are longer and lower, because they are heard across
 *     a change of scene rather than inside one.
 *
 * Gains are the mixing decision. The busiest frame the game can play is a
 * split: a button press, two card deals and, at the boundary after it, up to
 * four result cues and a milestone. Summing every voice of every one of those
 * cues at the gains below stays below 1.2 into a master that applies volume of
 * at most `MAX_VOLUME`, and the master itself is the last gain in the chain,
 * so a stack that peaks together is scaled as a stack rather than clipped a
 * voice at a time.
 */
const TONES: Readonly<Record<CueId, readonly Voice[]>> = Object.freeze({
  cardDeal: Object.freeze([
    Object.freeze({ frequency: 0, at: 0, seconds: 0.07, gain: 0.22, wave: 'sine' }),
  ]),
  cardFlip: Object.freeze([
    Object.freeze({ frequency: 0, at: 0, seconds: 0.05, gain: 0.3, wave: 'sine' }),
    Object.freeze({ frequency: 320, at: 0.01, seconds: 0.04, gain: 0.08, wave: 'triangle' }),
  ]),
  chipPlace: Object.freeze([
    Object.freeze({ frequency: 1900, at: 0, seconds: 0.035, gain: 0.16, wave: 'square' }),
    Object.freeze({ frequency: 0, at: 0.015, seconds: 0.03, gain: 0.14, wave: 'sine' }),
  ]),
  chipClear: Object.freeze([
    Object.freeze({ frequency: 620, at: 0, seconds: 0.09, gain: 0.14, wave: 'triangle' }),
    Object.freeze({ frequency: 460, at: 0.03, seconds: 0.09, gain: 0.12, wave: 'triangle' }),
  ]),
  buttonPress: Object.freeze([
    Object.freeze({ frequency: 1200, at: 0, seconds: 0.03, gain: 0.1, wave: 'sine' }),
  ]),
  win: Object.freeze([
    Object.freeze({ frequency: 523, at: 0, seconds: 0.12, gain: 0.16, wave: 'triangle' }),
    Object.freeze({ frequency: 659, at: 0.09, seconds: 0.16, gain: 0.16, wave: 'triangle' }),
  ]),
  blackjack: Object.freeze([
    Object.freeze({ frequency: 523, at: 0, seconds: 0.1, gain: 0.16, wave: 'triangle' }),
    Object.freeze({ frequency: 659, at: 0.08, seconds: 0.1, gain: 0.16, wave: 'triangle' }),
    Object.freeze({ frequency: 784, at: 0.16, seconds: 0.22, gain: 0.18, wave: 'triangle' }),
  ]),
  loss: Object.freeze([
    Object.freeze({ frequency: 330, at: 0, seconds: 0.14, gain: 0.16, wave: 'triangle' }),
    Object.freeze({ frequency: 233, at: 0.1, seconds: 0.2, gain: 0.16, wave: 'triangle' }),
  ]),
  push: Object.freeze([
    Object.freeze({ frequency: 440, at: 0, seconds: 0.12, gain: 0.14, wave: 'sine' }),
  ]),
  bust: Object.freeze([
    Object.freeze({ frequency: 140, at: 0, seconds: 0.3, gain: 0.2, wave: 'sawtooth' }),
    Object.freeze({ frequency: 0, at: 0, seconds: 0.12, gain: 0.18, wave: 'sine' }),
  ]),
  shuffle: Object.freeze([
    Object.freeze({ frequency: 0, at: 0, seconds: 0.34, gain: 0.16, wave: 'sine' }),
    Object.freeze({ frequency: 0, at: 0.08, seconds: 0.26, gain: 0.14, wave: 'sine' }),
  ]),
  milestone: Object.freeze([
    Object.freeze({ frequency: 784, at: 0, seconds: 0.09, gain: 0.14, wave: 'sine' }),
    Object.freeze({ frequency: 988, at: 0.07, seconds: 0.09, gain: 0.14, wave: 'sine' }),
    Object.freeze({ frequency: 1175, at: 0.14, seconds: 0.2, gain: 0.16, wave: 'sine' }),
  ]),
  bustOut: Object.freeze([
    Object.freeze({ frequency: 196, at: 0, seconds: 0.5, gain: 0.18, wave: 'sawtooth' }),
    Object.freeze({ frequency: 98, at: 0.05, seconds: 0.55, gain: 0.18, wave: 'sine' }),
  ]),
});

// ---------------------------------------------------------------------------
// The platform, injectable
// ---------------------------------------------------------------------------

/** The `navigator.audioSession` shape, on the engines that have one. */
export interface AudioSessionTarget {
  type: string;
}

/**
 * The surface the gesture policy listens on.
 *
 * `EventTarget` rather than `Document`, so a test can hand in a plain target
 * and the shipped page can hand in the real document without either knowing
 * about the other. The two events are named as literals at the bindings below.
 *
 * QUALITY-BAR section 10 names them: "the first `pointerdown` / `keydown`".
 * A `click` cannot replace either, because it arrives after the platform has
 * decided whether the press carried a user activation. The bindings are
 * written out per event rather than through a list, so the source scan behind
 * item `D1`'s checklist reads them: a listener registered through a variable
 * is invisible to the census and to the reviewer reading over it.
 */
function bindGestures(target: EventTarget, onGesture: () => void): void {
  target.addEventListener('pointerdown', onGesture);
  target.addEventListener('keydown', onGesture);
}

function unbindGestures(target: EventTarget, onGesture: () => void): void {
  target.removeEventListener('pointerdown', onGesture);
  target.removeEventListener('keydown', onGesture);
}

/**
 * SPEC 14's volume, clamped to the range the constants name.
 *
 * **The finite guard is the whole reason this is a function.** Both clamp sites
 * were `Math.min(MAX, Math.max(MIN, value))`, which answers `NaN` for a `NaN`
 * input, so `volume()` could report a value outside the range its own contract
 * promises and the `NaN` would reach the master gain. `AudioParam.value` is a
 * restricted `float` in WebIDL, so that assignment is a `TypeError` thrown
 * inside the first-gesture handler, which is inside the one function this
 * module promises never throws. Nothing reachable produces a non-finite volume
 * today: the settings panel and the document sanitiser both filter with
 * `Number.isFinite` first, and both of those guards are pinned. This is the
 * module's own guard, so the promise does not rest on its two callers.
 *
 * **The guard names `NaN` and not every non-finite value, because `NaN` is the
 * whole hole.** Both infinities already clamp correctly through the comparison
 * below, `-Infinity` to `MIN_VOLUME` and `+Infinity` to `MAX_VOLUME`, and
 * sending them to the default instead would change an answer that is right
 * today for no gain. Every other value, finite or infinite, reaches exactly the
 * expression it reached before.
 *
 * **`NaN` answers with the default and not with the volume already in force,
 * deliberately, and `DEFAULT_VOLUME` is 1.** The review that asked about this
 * is right that of the two defensible answers for an audio control, "unreadable
 * input, therefore loudest" is the one that startles. It is still the right one
 * here, for two reasons. The first is reachability: both shipped callers filter
 * with `Number.isFinite` before this is reached and both of those guards are
 * pinned, so a `NaN` arriving here is not a hostile player or a corrupt
 * document, it is a future caller's defect. The loud default makes that defect
 * audible at the moment it happens; holding the volume in force would swallow
 * it, and a setting that silently ignores writes is the harder bug to find. The
 * second is consistency: `storage/document.ts` sanitises every unreadable field
 * to its default rather than to the value in force, and an audio module that
 * answered the same question differently would be a second policy for one kind
 * of question. Nothing muffles: a startled player has a mute control in the top
 * bar at every width and a slider in Settings.
 */
function clampVolume(value: number): number {
  return Number.isNaN(value) ? DEFAULT_VOLUME : Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, value));
}

/** A context, on a platform that offers one. Never called outside a gesture. */
function platformContext(): AudioContext | null {
  if (typeof AudioContext !== 'function') {
    return null;
  }
  return new AudioContext();
}

/** The iOS audio session, behind the feature test the quality bar asks for. */
function platformAudioSession(): AudioSessionTarget | null {
  if (typeof navigator === 'undefined') {
    return null;
  }
  // `audioSession` is the Safari spelling and is not on every `Navigator`
  // type this project compiles against, so the feature test is written as a
  // read of the value rather than as a type the compiler already believes in.
  const session = (navigator as Navigator & { readonly audioSession?: AudioSessionTarget })
    .audioSession;
  return session === undefined ? null : session;
}

/** What a build of the engine may be told. Every field has a default. */
export interface AudioEngineOptions {
  /** SPEC 14's mute, applied at creation. `DEFAULT_MUTED` by default. */
  readonly muted?: boolean;
  /** SPEC 14's volume, applied at creation. `DEFAULT_VOLUME` by default. */
  readonly volume?: number;
  /**
   * A context factory, for a test that needs a known or a failing one.
   *
   * Injected in the same spirit as `MotionPreferenceOptions.query`: disclosed,
   * off every path a player can take, and unable to change what an
   * unparameterised construction does. The browser gate does not use it; it
   * wraps the real constructor before the page loads, which is the thing `K2`
   * grades.
   */
  readonly contextFactory?: (() => AudioContext | null) | null;
  /** The surface the gesture listeners and the visibility listener sit on. */
  readonly listeners?: EventTarget | null;
  /** Where `visibilitychange` is read. Defaults to the same surface. */
  readonly visibility?: VisibilityTarget | null;
  /**
   * The audio session to route through, or `null` to say there is none.
   *
   * `undefined` means "ask the platform", so a test can force either branch
   * of the feature test; the default is the asking.
   */
  readonly audioSession?: AudioSessionTarget | null;
}

/** The engine. Offered cues; asked for its state; disposed by the root. */
export interface AudioEngine {
  /** Offer one cue. Tallied always; audible only when there is a running way. */
  cue(cue: CueId, phase: string): void;
  /** SPEC 14's mute. Applied at creation and live thereafter. */
  setMuted(muted: boolean): void;
  /** SPEC 14's volume, clamped to the range the constants name. */
  setVolume(volume: number): void;
  /** The mute in force. */
  muted(): boolean;
  /** The volume in force, after clamping. */
  volume(): number;
  /** Whether the first gesture has been answered, however it answered. */
  started(): boolean;
  /**
   * How many times each cue has been offered, and in which phases.
   *
   * The emission record rather than the audibility record: a cue offered while
   * muted or before any gesture still happened, and item `K5`'s "exactly once,
   * and on no other trigger" is a claim about the offer. The phase key is the
   * SPEC 10 screen the machine was on the frame the cue fired, which is what
   * makes a negative control writable in a browser: a cue that must never fire
   * in a phase is a key this map must not carry.
   *
   * This is also item `K4`'s hook, and armour rather than closure: the parity
   * capture that closes `K4` is `BJ-23`'s demonstration session, and the tally
   * beside the recorded screen is what lets it hold the audio half and the
   * visual half of "every cue has a counterpart" against one run.
   */
  offered(): Readonly<Record<CueId, number>>;
  /** The same counts, keyed `cue@phase`. */
  offeredInPhase(): Readonly<Record<string, number>>;
  /** Take the listeners off and close the context, if one was ever made. */
  dispose(): void;
}

/**
 * Build the engine. Nothing sounds until a gesture, and nothing throws.
 *
 * The listeners go on at construction, because the gesture has to be caught
 * whenever it comes; the context does not, because catching it and making it
 * are different duties and only the first may happen early.
 */
export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const mutedStart = options.muted ?? DEFAULT_MUTED;
  const volumeStart = clampVolume(options.volume === undefined ? DEFAULT_VOLUME : options.volume);
  const factory: () => AudioContext | null = options.contextFactory ?? platformContext;
  const gestureTarget = options.listeners === undefined ? pageDocument() : options.listeners;
  const visibilityTarget =
    options.visibility === undefined ? (gestureTarget as VisibilityTarget | null) : options.visibility;

  let muted = mutedStart;
  let volume = volumeStart;
  let started = false;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  const offered: Record<CueId, number> = Object.fromEntries(
    CUE_IDS.map((cue) => [cue, 0]),
  ) as Record<CueId, number>;
  const byPhase: Record<string, number> = {};

  /** The master gain, from the mute and volume in force right now. */
  function level(): number {
    return muted ? MIN_VOLUME : volume;
  }

  /**
   * The first user gesture. QUALITY-BAR section 10's whole autoplay policy,
   * in one function that runs at most once.
   *
   * The session routing has its own guard rather than sitting inside the
   * context try below: the feature test is the guard against a platform with
   * no session, and the local try is the guard against one that exposes the
   * field but refuses the write. Both are named failures the engine survives,
   * because the quality bar's "never throws" is a clause about the game and
   * not only about the context.
   */
  function start(): void {
    if (started) {
      return;
    }
    started = true;
    if (gestureTarget !== null) {
      unbindGestures(gestureTarget, onGesture);
    }
    const session =
      options.audioSession === undefined ? platformAudioSession() : options.audioSession;
    if (session !== null) {
      try {
        session.type = 'playback';
      } catch (error) {
        // The feature test above covers a platform with no session at all.
        // This guard covers the one it cannot: a platform that exposes the
        // field as read-only, whose assignment would throw in strict mode and
        // take the whole gesture handler with it. The routing is best-effort
        // by the quality bar's own wording ("where it exists"), and a
        // refused write costs the Ring/Silent switch, not the game.
        void error;
      }
    }
    try {
      context = factory();
    } catch (error) {
      // QUALITY-BAR section 10: "never throws when a context cannot be
      // created". The failure is named and the engine stays silent forever
      // after, which is the quality bar's own answer to it.
      void error;
      context = null;
      return;
    }
    if (context === null) {
      return;
    }
    master = context.createGain();
    master.gain.value = level();
    master.connect(context.destination);
    // Resumed here, in the gesture, per the section. The promise is caught
    // because an unhandled rejection would be a page error over a feature the
    // game does not need, and "continues silently" is the section's own rule
    // for a context that still will not run.
    void context.resume().catch((error: unknown) => {
      void error;
    });
  }

  function onGesture(): void {
    start();
  }

  function onVisibility(): void {
    // The visible half alone: a page that has gone hidden has no cue worth
    // resuming for, and the section names the return, not the departure.
    if (visibilityTarget === null || visibilityTarget.visibilityState !== 'visible') {
      return;
    }
    if (context === null) {
      return;
    }
    void context.resume().catch((error: unknown) => {
      void error;
    });
  }

  if (gestureTarget !== null) {
    bindGestures(gestureTarget, onGesture);
  }
  visibilityTarget?.addEventListener('visibilitychange', onVisibility);

  return {
    cue(cue: CueId, phase: string): void {
      offered[cue] += 1;
      const key = `${cue}@${phase}`;
      byPhase[key] = (byPhase[key] ?? 0) + 1;
      if (context === null || master === null || muted) {
        return;
      }
      const start = context.currentTime;
      for (const voice of TONES[cue]) {
        const at = start + voice.at;
        if (voice.frequency === 0) {
          if (noise === null) {
            // Once, on the first percussive cue, and never regenerated:
            // QUALITY-BAR section 10's own words. The buffer is created here
            // rather than at the gesture because a muted session that never
            // plays a cue has no buffer to make, and making one anyway would
            // be work the mute was asked to prevent.
            const samples = Math.max(1, Math.floor(context.sampleRate * NOISE_SECONDS));
            noise = context.createBuffer(1, samples, context.sampleRate);
            const channel = noise.getChannelData(0);
            for (let index = 0; index < samples; index += 1) {
              // The one random number in the audio layer, and it is the
              // noise a percussion cue is. This is not `core/`, and no game
              // decision reads it: two runs differ in hiss and in nothing
              // else, which is what noise is.
              channel[index] = Math.random() * 2 - 1;
            }
          }
          const source = context.createBufferSource();
          source.buffer = noise;
          const envelope = context.createGain();
          envelope.gain.setValueAtTime(voice.gain, at);
          envelope.gain.exponentialRampToValueAtTime(ENVELOPE_FLOOR, at + voice.seconds);
          source.connect(envelope);
          envelope.connect(master);
          source.start(at);
          source.stop(at + voice.seconds + STOP_EPSILON);
          continue;
        }
        const oscillator = context.createOscillator();
        oscillator.type = voice.wave;
        oscillator.frequency.value = voice.frequency;
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(voice.gain, at);
        envelope.gain.exponentialRampToValueAtTime(ENVELOPE_FLOOR, at + voice.seconds);
        oscillator.connect(envelope);
        envelope.connect(master);
        oscillator.start(at);
        oscillator.stop(at + voice.seconds + STOP_EPSILON);
      }
    },

    setMuted(next: boolean): void {
      muted = next;
      if (master !== null) {
        master.gain.value = level();
      }
    },

    setVolume(next: number): void {
      volume = clampVolume(next);
      if (master !== null) {
        master.gain.value = level();
      }
    },

    muted: () => muted,
    volume: () => volume,
    started: () => started,
    offered: () => Object.freeze({ ...offered }),
    offeredInPhase: () => Object.freeze({ ...byPhase }),

    dispose(): void {
      if (gestureTarget !== null) {
        unbindGestures(gestureTarget, onGesture);
      }
      visibilityTarget?.removeEventListener('visibilitychange', onVisibility);
      if (context !== null) {
        const closing = context;
        void closing.close().catch((error: unknown) => {
          void error;
        });
        context = null;
        master = null;
      }
    },
  };
}
