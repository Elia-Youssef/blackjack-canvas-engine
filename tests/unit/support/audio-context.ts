/**
 * A recording stand-in for `AudioContext`, on the `recording-context.ts`
 * precedent: armour only counts if it can see, and what the engine's tests
 * inspect is exactly the graph it builds, which no assertion about the
 * returned tallies can read. Everything the engine touches is recorded and
 * everything it might read answers a plausible constant.
 *
 * Nothing here is a real audio graph. The engine is trusted with the API's
 * shapes and this stand-in with its bookkeeping, which is the division the
 * canvas tests already work under. The cast to `AudioContext` happens at the
 * call site, once, where the test says what it is doing.
 */

/** One voice the engine started, as the stand-in saw it. */
export interface VoiceRecord {
  readonly kind: 'oscillator' | 'noise';
  readonly frequency: number;
  readonly at: number;
}

/**
 * The stand-in. Its public fields are the record; the engine only ever calls
 * the methods, so reading them from the test is reading the same object.
 */
export class RecordingAudioContext {
  readonly state = 'suspended';
  /** Non-zero, so a cue scheduled "now" is visibly scheduled somewhere. */
  readonly currentTime = 7.5;
  readonly sampleRate = 48_000;
  readonly destination = {};

  constructed = 0;
  resumed = 0;
  closed = 0;
  buffersCreated = 0;
  /** Every gain level the engine wrote, in order, envelopes and master alike. */
  readonly gainWrites: number[] = [];
  readonly voices: VoiceRecord[] = [];
  /** The first gain node created, which the engine's master is. */
  master: { readonly gain: { readonly value: number } } | null = null;

  constructor() {
    this.constructed = 1;
  }

  resume(): Promise<void> {
    this.resumed += 1;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed += 1;
    return Promise.resolve();
  }

  /**
   * A gain node whose `value` is as strict as the real one.
   *
   * `AudioParam.value` is a WebIDL restricted `float`, so a real engine throws
   * a `TypeError` on a non-finite write. A plain field takes `NaN` without
   * complaint, and a stand-in that is more permissive than the platform is a
   * stand-in that cannot see the one defect a volume clamp can have. The
   * getter and setter are what let `audio.test.ts` assert the engine's clamp
   * rather than assert that nothing threw.
   */
  createGain(): unknown {
    let level = 1;
    const node = {
      gain: {
        get value(): number {
          return level;
        },
        set value(next: number) {
          if (!Number.isFinite(next)) {
            throw new TypeError('AudioParam.value is a restricted float');
          }
          level = next;
        },
        setValueAtTime: (value: number, at: number): void => {
          this.gainWrites.push(value);
          void at;
        },
        exponentialRampToValueAtTime: (value: number, at: number): void => {
          void value;
          void at;
        },
      },
      connect: (): void => {
        // The graph's shape is recorded where it matters; the connection is
        // not a claim any test makes.
      },
    };
    if (this.master === null) {
      this.master = node;
    }
    return node;
  }

  createOscillator(): unknown {
    const frequency = { value: 0 };
    return {
      type: 'sine',
      frequency,
      connect: (): void => {},
      start: (at: number): void => {
        this.voices.push({ kind: 'oscillator', frequency: frequency.value, at });
      },
      stop: (): void => {},
    };
  }

  createBuffer(channels: number, length: number): unknown {
    void channels;
    this.buffersCreated += 1;
    return { getChannelData: (): Float32Array => new Float32Array(length) };
  }

  createBufferSource(): unknown {
    return {
      buffer: null as unknown,
      connect: (): void => {},
      start: (at: number): void => {
        this.voices.push({ kind: 'noise', frequency: 0, at });
      },
      stop: (): void => {},
    };
  }
}
