/**
 * A recording canvas context, for driving `src/render/` headlessly.
 *
 * Vitest runs in a node environment with no rasteriser, so the unit armour for
 * E3, E4 and E5 asserts the *instructions* the renderer issues rather than the
 * pixels they become: which operations, with which arguments, under which
 * state, in which order. Rasterised pixels are the browser suite's half
 * (`tests/browser/render-surface.spec.ts`, on a real canvas in all three
 * engines) and the demonstration captures' whole.
 *
 * Every method call and every property assignment lands in one flat `entries`
 * list, so ordering claims ("every shape before any text") are a comparison of
 * indices rather than a mocking framework's. Only plain data is recorded: a
 * gradient is recorded as its descriptor, never as the stub object, so two
 * recordings of the same drawing are `toEqual`-comparable, which is what the
 * felt's determinism armour compares.
 *
 * The stub deliberately implements more of the 2D interface than the renderer
 * uses today; an unrecorded method would vanish from the entry stream and an
 * assertion over it would pass vacuously.
 */

import type { SurfaceCanvas } from '../../../src/render/surface';

export interface RecordedCall {
  readonly kind: 'call';
  readonly op: string;
  readonly args: readonly unknown[];
}

export interface RecordedSet {
  readonly kind: 'set';
  readonly property: string;
  readonly value: unknown;
}

export type RecordedEntry = RecordedCall | RecordedSet;

/** A recorded gradient: what was asked for and the stops it was given. */
export interface GradientDescriptor {
  readonly gradient: 'createLinearGradient' | 'createRadialGradient';
  readonly args: readonly unknown[];
  readonly stops: { offset: number; color: string }[];
}

const METHODS = [
  'save',
  'restore',
  'scale',
  'rotate',
  'translate',
  'transform',
  'setTransform',
  'resetTransform',
  'clearRect',
  'fillRect',
  'strokeRect',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'bezierCurveTo',
  'quadraticCurveTo',
  'arc',
  'arcTo',
  'ellipse',
  'rect',
  'roundRect',
  'fill',
  'stroke',
  'clip',
  'setLineDash',
  'fillText',
  'strokeText',
  'drawImage',
] as const;

const PROPERTIES = [
  'fillStyle',
  'strokeStyle',
  'lineWidth',
  'lineJoin',
  'lineCap',
  'font',
  'textAlign',
  'textBaseline',
  'globalAlpha',
  'globalCompositeOperation',
] as const;

export interface RecordingContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly entries: RecordedEntry[];
  calls(op: string): RecordedCall[];
  sets(property: string): RecordedSet[];
  /** The value the property held when entry `index` was recorded. */
  valueBefore(index: number, property: string): unknown;
  /** Index of the nth call of `op` in the entry stream, -1 when absent. */
  indexOfCall(op: string, nth?: number): number;
}

export function createRecordingContext(): RecordingContext {
  const entries: RecordedEntry[] = [];
  const target: Record<string, unknown> = {};

  for (const op of METHODS) {
    target[op] = (...args: unknown[]): void => {
      entries.push({ kind: 'call', op, args });
    };
  }

  for (const factory of ['createLinearGradient', 'createRadialGradient'] as const) {
    target[factory] = (...args: unknown[]): unknown => {
      entries.push({ kind: 'call', op: factory, args });
      const descriptor: GradientDescriptor = { gradient: factory, args, stops: [] };
      return {
        descriptor,
        addColorStop(offset: number, color: string): void {
          descriptor.stops.push({ offset, color });
        },
      };
    };
  }

  for (const property of PROPERTIES) {
    let current: unknown;
    Object.defineProperty(target, property, {
      get(): unknown {
        return current;
      },
      set(value: unknown): void {
        current = value;
        const withDescriptor = value as { descriptor?: GradientDescriptor } | null;
        const recorded =
          withDescriptor !== null && typeof value === 'object' && withDescriptor.descriptor !== undefined
            ? withDescriptor.descriptor
            : value;
        entries.push({ kind: 'set', property, value: recorded });
      },
    });
  }

  return {
    ctx: target as unknown as CanvasRenderingContext2D,
    entries,
    calls(op: string): RecordedCall[] {
      return entries.filter((entry): entry is RecordedCall => entry.kind === 'call' && entry.op === op);
    },
    sets(property: string): RecordedSet[] {
      return entries.filter(
        (entry): entry is RecordedSet => entry.kind === 'set' && entry.property === property,
      );
    },
    valueBefore(index: number, property: string): unknown {
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const entry = entries[cursor];
        if (entry !== undefined && entry.kind === 'set' && entry.property === property) {
          return entry.value;
        }
      }
      return undefined;
    },
    indexOfCall(op: string, nth = 0): number {
      let seen = 0;
      for (let cursor = 0; cursor < entries.length; cursor += 1) {
        const entry = entries[cursor];
        if (entry !== undefined && entry.kind === 'call' && entry.op === op) {
          if (seen === nth) {
            return cursor;
          }
          seen += 1;
        }
      }
      return -1;
    },
  };
}

/** A canvas stub whose context records, for `createSurface` and the bakes. */
export interface RecordingCanvas {
  readonly canvas: SurfaceCanvas & { readonly style: { width: string; height: string } };
  readonly recording: RecordingContext;
}

export function createRecordingCanvas(): RecordingCanvas {
  const recording = createRecordingContext();
  const canvas = {
    width: 0,
    height: 0,
    style: { width: '', height: '' },
    getContext(contextId: '2d'): CanvasRenderingContext2D | null {
      return contextId === '2d' ? recording.ctx : null;
    },
  };
  return { canvas, recording };
}

/** A canvas stub with no style, the shape an offscreen canvas presents. */
export function createStyleFreeCanvas(): { canvas: SurfaceCanvas; recording: RecordingContext } {
  const recording = createRecordingContext();
  const canvas: SurfaceCanvas = {
    width: 0,
    height: 0,
    getContext(contextId: '2d'): CanvasRenderingContext2D | null {
      return contextId === '2d' ? recording.ctx : null;
    },
  };
  return { canvas, recording };
}
