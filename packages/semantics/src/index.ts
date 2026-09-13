import type {
  Easing,
  NumberTrack,
  TempoSegment,
  TimeValue,
  Timebase,
  Transform2DTracks
} from "@introgenerator/model";

export interface Affine2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY_AFFINE: Affine2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function timeToSeconds(time: TimeValue, timebase: Timebase): number {
  switch (time.unit) {
    case "seconds":
      return time.value;
    case "frames":
      return time.value / timebase.fps;
    case "beats":
      return beatToSeconds(time.value, timebase.tempoMap);
  }
}

export function beatToSeconds(beat: number, segments: TempoSegment[]): number {
  if (segments.length === 0) {
    throw new Error("Tempo map must contain at least one segment.");
  }
  let selected = segments[0]!;
  for (const segment of segments) {
    if (segment.startBeat <= beat) selected = segment;
    else break;
  }
  return selected.startSeconds + ((beat - selected.startBeat) * 60) / selected.bpm;
}

export function secondsToBeat(seconds: number, segments: TempoSegment[]): number {
  if (segments.length === 0) {
    throw new Error("Tempo map must contain at least one segment.");
  }
  let selected = segments[0]!;
  for (const segment of segments) {
    if (segment.startSeconds <= seconds) selected = segment;
    else break;
  }
  return selected.startBeat + ((seconds - selected.startSeconds) * selected.bpm) / 60;
}

export function isActive(startSeconds: number, endSeconds: number, tSeconds: number): boolean {
  return startSeconds <= tSeconds && tSeconds < endSeconds;
}

export function evaluateTrack(track: NumberTrack, tSeconds: number, timebase: Timebase): number {
  const keyframes = track.keyframes;
  if (!keyframes || keyframes.length === 0) return track.defaultValue;

  const normalized = keyframes
    .map((keyframe, index) => ({ ...keyframe, index, seconds: timeToSeconds(keyframe.time, timebase) }))
    .sort((a, b) => a.seconds - b.seconds || a.index - b.index);

  if (tSeconds <= normalized[0]!.seconds) return normalized[0]!.value;
  const last = normalized[normalized.length - 1]!;
  if (tSeconds >= last.seconds) return last.value;

  for (let i = 0; i < normalized.length - 1; i++) {
    const left = normalized[i]!;
    const right = normalized[i + 1]!;
    if (left.seconds <= tSeconds && tSeconds < right.seconds) {
      const span = right.seconds - left.seconds;
      if (span <= 0) return right.value;
      const raw = (tSeconds - left.seconds) / span;
      const eased = applyEasing(raw, left.easing ?? { type: "linear" });
      return left.value + (right.value - left.value) * eased;
    }
  }

  return last.value;
}

export function applyEasing(progress: number, easing: Easing): number {
  const x = clamp01(progress);
  switch (easing.type) {
    case "linear":
      return x;
    case "hold":
      return 0;
    case "cubic-bezier":
      return cubicBezierYForX(x, easing.x1, easing.y1, easing.x2, easing.y2);
  }
}

export function cubicBezierYForX(x: number, x1: number, y1: number, x2: number, y2: number): number {
  const sampleX = (t: number) => cubic(t, 0, x1, x2, 1);
  const sampleY = (t: number) => cubic(t, 0, y1, y2, 1);
  const derivativeX = (t: number) => cubicDerivative(t, 0, x1, x2, 1);

  let t = x;
  for (let i = 0; i < 8; i++) {
    const error = sampleX(t) - x;
    if (Math.abs(error) < 1e-7) return sampleY(t);
    const derivative = derivativeX(t);
    if (Math.abs(derivative) < 1e-7) break;
    t = clamp01(t - error / derivative);
  }

  let low = 0;
  let high = 1;
  t = x;
  for (let i = 0; i < 30; i++) {
    const current = sampleX(t);
    if (Math.abs(current - x) < 1e-7) break;
    if (current < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return sampleY(t);
}

function cubic(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function cubicDerivative(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function multiplyAffine(left: Affine2D, right: Affine2D): Affine2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  };
}

export function translation(x: number, y: number): Affine2D {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function rotationDeg(deg: number): Affine2D {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function scale(x: number, y: number): Affine2D {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
}

export function skewDeg(xDeg: number, yDeg: number): Affine2D {
  return {
    a: 1,
    b: Math.tan((yDeg * Math.PI) / 180),
    c: Math.tan((xDeg * Math.PI) / 180),
    d: 1,
    e: 0,
    f: 0
  };
}

export interface EvaluatedTransform2D {
  x: number;
  y: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  skewXDeg: number;
  skewYDeg: number;
  anchorX: number;
  anchorY: number;
  matrix: Affine2D;
}

export function evaluateTransform(tracks: Transform2DTracks, tSeconds: number, timebase: Timebase): EvaluatedTransform2D {
  const x = evaluateTrack(tracks.x, tSeconds, timebase);
  const y = evaluateTrack(tracks.y, tSeconds, timebase);
  const rotation = evaluateTrack(tracks.rotationDeg, tSeconds, timebase);
  const scaleX = evaluateTrack(tracks.scaleX, tSeconds, timebase);
  const scaleY = evaluateTrack(tracks.scaleY, tSeconds, timebase);
  const skewX = evaluateTrack(tracks.skewXDeg, tSeconds, timebase);
  const skewY = evaluateTrack(tracks.skewYDeg, tSeconds, timebase);
  const anchorX = evaluateTrack(tracks.anchorX, tSeconds, timebase);
  const anchorY = evaluateTrack(tracks.anchorY, tSeconds, timebase);

  const matrix = multiplyAffine(
    multiplyAffine(
      multiplyAffine(
        multiplyAffine(translation(x, y), rotationDeg(rotation)),
        skewDeg(skewX, skewY)
      ),
      scale(scaleX, scaleY)
    ),
    translation(-anchorX, -anchorY)
  );

  return {
    x,
    y,
    rotationDeg: rotation,
    scaleX,
    scaleY,
    skewXDeg: skewX,
    skewYDeg: skewY,
    anchorX,
    anchorY,
    matrix
  };
}

export function sampleHistoricalTimes(
  currentSeconds: number,
  sampleCount: number,
  shutterSeconds: number
): number[] {
  if (sampleCount <= 0 || shutterSeconds <= 0) return [];
  const result: number[] = [];
  for (let i = sampleCount; i >= 1; i--) {
    result.push(currentSeconds - (shutterSeconds * i) / sampleCount);
  }
  return result;
}

export function deterministicNoise(seed: number, coordinate: number): number {
  const i0 = Math.floor(coordinate);
  const i1 = i0 + 1;
  const f = coordinate - i0;
  const smooth = f * f * (3 - 2 * f);
  const n0 = hashToUnit(seed, i0);
  const n1 = hashToUnit(seed, i1);
  return n0 + (n1 - n0) * smooth;
}

function hashToUnit(seed: number, index: number): number {
  let x = (index | 0) ^ (seed | 0);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
}

export interface ActiveIdRange {
  startId: number;
  endIdExclusive: number;
  count: number;
}

/**
 * Returns the finite integer-ID window needed for periodic generators.
 * Compatibility formula: floor(progress / interval) - ceil(max / interval),
 * with ceil(max / interval) + 1 candidates.
 */
export function activeIdRange(progress: number, max: number, interval: number): ActiveIdRange {
  if (!Number.isFinite(progress)) throw new Error("progress must be finite.");
  if (!Number.isFinite(max) || max < 0) throw new Error("max must be finite and non-negative.");
  if (!Number.isFinite(interval) || interval <= 0) throw new Error("interval must be finite and positive.");
  const historyCount = Math.ceil(max / interval);
  const startId = Math.floor(progress / interval) - historyCount;
  const count = historyCount + 1;
  return { startId, endIdExclusive: startId + count, count };
}

export function enumerateIdRange(range: ActiveIdRange): number[] {
  return Array.from({ length: range.count }, (_, offset) => range.startId + offset);
}

export function indexedPhase(progress: number, interval: number, id: number): number {
  return progress - interval * id;
}

export function fractionalPart(value: number): number {
  return value - Math.floor(value);
}

export const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) / 2;

/** q = frac(ID * (sqrt(5) - 1) / 2), deterministic for every integer ID. */
export function goldenRatioPhase(id: number): number {
  return fractionalPart(id * GOLDEN_RATIO_CONJUGATE);
}
