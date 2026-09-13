export type Id = string;

export type SecondsTime = { unit: "seconds"; value: number };
export type BeatsTime = { unit: "beats"; value: number };
export type FramesTime = { unit: "frames"; value: number };
export type TimeValue = SecondsTime | BeatsTime | FramesTime;

export interface TempoSegment {
  /** Beat at which this segment starts. Segments must be sorted ascending. */
  startBeat: number;
  /** Absolute seconds corresponding to startBeat. */
  startSeconds: number;
  bpm: number;
}

export interface Timebase {
  fps: number;
  tempoMap: TempoSegment[];
}

export type Easing =
  | { type: "linear" }
  | { type: "hold" }
  | { type: "cubic-bezier"; x1: number; y1: number; x2: number; y2: number };

export interface NumberKeyframe {
  time: TimeValue;
  value: number;
  /** Outgoing interpolation from this keyframe to the next keyframe. */
  easing?: Easing;
}

export interface NumberTrack {
  defaultValue: number;
  keyframes?: NumberKeyframe[];
}

export interface Transform2DTracks {
  x: NumberTrack;
  y: NumberTrack;
  rotationDeg: NumberTrack;
  scaleX: NumberTrack;
  scaleY: NumberTrack;
  skewXDeg: NumberTrack;
  skewYDeg: NumberTrack;
  anchorX: NumberTrack;
  anchorY: NumberTrack;
}

export interface NodeTiming {
  start: TimeValue;
  end: TimeValue;
}

export type RenderPassName =
  | "background"
  | "world"
  | "particles"
  | "effect-shadow"
  | "effect-base"
  | "foreground"
  | "text"
  | "overlay"
  | (string & {});

export interface TemporalSamplingSpec {
  /** Number of historical samples. Current sharp sample is separate. */
  sampleCount: number;
  /** Look-back duration in seconds. */
  shutterSeconds: number;
  distribution: "uniform";
  /** Multiplier applied to each historical sample opacity. */
  historicalOpacity: number;
  includeCurrent: boolean;
}

export interface CommonNodeFields {
  id: Id;
  name?: string;
  timing: NodeTiming;
  transform: Transform2DTracks;
  opacity: NumberTrack;
  pass: RenderPassName;
  order: number;
  temporalSampling?: TemporalSamplingSpec;
}

export interface StampNode extends CommonNodeFields {
  type: "stamp";
  assetId: Id;
}

export interface GroupNode extends CommonNodeFields {
  type: "group";
  children: SceneNode[];
}

export interface RepeaterGeneratorSpec {
  type: "repeater";
  count: number;
  offsetX: number;
  offsetY: number;
  rotationStepDeg: number;
  scaleStepX: number;
  scaleStepY: number;
  /** Per-instance time offset. Positive values evaluate later instances later. */
  timeOffsetSeconds: number;
}

/**
 * Finite window over an otherwise unbounded integer ID domain.
 * `progress`, `max` and `interval` are semantic values; no Scratch storage layout leaks here.
 */
export interface IndexedWindowSpec {
  progress: NumberTrack;
  max: number;
  interval: number;
}

/** Periodic/infinite-scroll instances reconstructed directly from time. */
export interface PeriodicGeneratorSpec extends IndexedWindowSpec {
  type: "periodic";
  phaseToX: number;
  phaseToY: number;
  rotationStepDeg: number;
}

/** Deterministic radial particles reconstructed from time + integer ID. */
export interface ParticleGeneratorSpec extends IndexedWindowSpec {
  type: "particle";
  angleDistribution: "golden-ratio";
  radiusScale: number;
  rotationPerPhaseDeg: number;
}

export type GeneratorSpec =
  | RepeaterGeneratorSpec
  | PeriodicGeneratorSpec
  | ParticleGeneratorSpec;

export interface GeneratorNode extends CommonNodeFields {
  type: "generator";
  generator: GeneratorSpec;
  template: StampNode;
}

export type SceneNode = StampNode | GroupNode | GeneratorNode;

export interface CameraShakeModifier {
  type: "shake";
  seed: number;
  frequencyHz: number;
  amplitudeX: number;
  amplitudeY: number;
  amplitudeRotationDeg: number;
}

export interface Camera2D {
  x: NumberTrack;
  y: NumberTrack;
  rotationDeg: NumberTrack;
  zoom: NumberTrack;
  modifiers?: CameraShakeModifier[];
}

export interface Composition {
  id: Id;
  name: string;
  width: number;
  height: number;
  duration: TimeValue;
  timebase: Timebase;
  camera: Camera2D;
  nodes: SceneNode[];
}

export interface Asset {
  id: Id;
  kind: "image" | "svg" | "costume" | "generated";
  source: string;
}

export interface AuthoringProject {
  version: 1;
  seed: number;
  compositions: Composition[];
  assets: Asset[];
}

export const seconds = (value: number): SecondsTime => ({ unit: "seconds", value });
export const beats = (value: number): BeatsTime => ({ unit: "beats", value });
export const frames = (value: number): FramesTime => ({ unit: "frames", value });

export const constantTrack = (value: number): NumberTrack => ({ defaultValue: value });

export const identityTransform = (): Transform2DTracks => ({
  x: constantTrack(0),
  y: constantTrack(0),
  rotationDeg: constantTrack(0),
  scaleX: constantTrack(1),
  scaleY: constantTrack(1),
  skewXDeg: constantTrack(0),
  skewYDeg: constantTrack(0),
  anchorX: constantTrack(0),
  anchorY: constantTrack(0)
});
