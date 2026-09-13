import type {
  AuthoringProject,
  Camera2D,
  Composition,
  GeneratorNode,
  GroupNode,
  RenderPassName,
  SceneNode,
  StampNode,
  TemporalSamplingSpec,
  Timebase
} from "@introgenerator/model";
import {
  IDENTITY_AFFINE,
  deterministicNoise,
  evaluateTrack,
  evaluateTransform,
  isActive,
  multiplyAffine,
  rotationDeg,
  sampleHistoricalTimes,
  scale,
  timeToSeconds,
  translation,
  type Affine2D
} from "@introgenerator/semantics";

export interface EvaluatedCamera {
  base: {
    x: number;
    y: number;
    rotationDeg: number;
    zoom: number;
  };
  final: {
    x: number;
    y: number;
    rotationDeg: number;
    zoom: number;
  };
  viewMatrix: Affine2D;
}

export interface EvaluatedStamp {
  kind: "stamp";
  id: string;
  sourceNodeId: string;
  ownerNodeId: string;
  assetId: string;
  sampleTimeSeconds: number;
  sampleKind: "historical" | "current";
  instanceIndex: number | null;
  worldMatrix: Affine2D;
  screenMatrix: Affine2D;
  opacity: number;
  pass: RenderPassName;
  order: number;
}

export interface EvaluatedScene {
  compositionId: string;
  timeSeconds: number;
  durationSeconds: number;
  camera: EvaluatedCamera;
  stamps: EvaluatedStamp[];
}

export interface EvaluateOptions {
  seed?: number;
}

interface EvaluationContext {
  composition: Composition;
  timebase: Timebase;
  projectSeed: number;
}

interface NodeEvaluationState {
  parentMatrix: Affine2D;
  parentOpacity: number;
  ownerNodeId?: string | undefined;
  instanceIndex?: number | null | undefined;
}

export function evaluateComposition(
  project: AuthoringProject,
  compositionId: string,
  timeSeconds: number,
  options: EvaluateOptions = {}
): EvaluatedScene {
  const composition = project.compositions.find((candidate) => candidate.id === compositionId);
  if (!composition) throw new Error(`Composition not found: ${compositionId}`);

  const context: EvaluationContext = {
    composition,
    timebase: composition.timebase,
    projectSeed: options.seed ?? project.seed
  };

  const stamps: EvaluatedStamp[] = [];
  for (const node of composition.nodes) {
    evaluateNode(node, timeSeconds, context, {
      parentMatrix: IDENTITY_AFFINE,
      parentOpacity: 1
    }, stamps);
  }

  return {
    compositionId,
    timeSeconds,
    durationSeconds: timeToSeconds(composition.duration, composition.timebase),
    camera: evaluateCamera(composition.camera, timeSeconds, composition.timebase, context.projectSeed),
    stamps
  };
}

function evaluateNode(
  node: SceneNode,
  tSeconds: number,
  context: EvaluationContext,
  state: NodeEvaluationState,
  output: EvaluatedStamp[]
): void {
  const sampler = node.temporalSampling;
  if (!sampler) {
    evaluateNodeAtSample(node, tSeconds, "current", 1, context, state, output);
    return;
  }

  for (const sampleTime of sampleHistoricalTimes(tSeconds, sampler.sampleCount, sampler.shutterSeconds)) {
    evaluateNodeAtSample(
      node,
      sampleTime,
      "historical",
      sampler.historicalOpacity,
      context,
      state,
      output
    );
  }

  if (sampler.includeCurrent) {
    evaluateNodeAtSample(node, tSeconds, "current", 1, context, state, output);
  }
}

function evaluateNodeAtSample(
  node: SceneNode,
  tSeconds: number,
  sampleKind: "historical" | "current",
  sampleOpacity: number,
  context: EvaluationContext,
  state: NodeEvaluationState,
  output: EvaluatedStamp[]
): void {
  const start = timeToSeconds(node.timing.start, context.timebase);
  const end = timeToSeconds(node.timing.end, context.timebase);
  if (!isActive(start, end, tSeconds)) return;

  const transform = evaluateTransform(node.transform, tSeconds, context.timebase);
  const localOpacity = clamp01(evaluateTrack(node.opacity, tSeconds, context.timebase));
  const worldMatrix = multiplyAffine(state.parentMatrix, transform.matrix);
  const opacity = state.parentOpacity * localOpacity * sampleOpacity;

  switch (node.type) {
    case "stamp":
      emitStamp(node, tSeconds, sampleKind, worldMatrix, opacity, context, state, output);
      break;
    case "group":
      evaluateGroup(node, tSeconds, worldMatrix, opacity, context, state, output);
      break;
    case "generator":
      evaluateGenerator(node, tSeconds, sampleKind, worldMatrix, opacity, context, output);
      break;
  }
}

function emitStamp(
  node: StampNode,
  tSeconds: number,
  sampleKind: "historical" | "current",
  worldMatrix: Affine2D,
  opacity: number,
  context: EvaluationContext,
  state: NodeEvaluationState,
  output: EvaluatedStamp[]
): void {
  const camera = evaluateCamera(context.composition.camera, tSeconds, context.timebase, context.projectSeed);
  const ownerNodeId = state.ownerNodeId ?? node.id;
  const instanceIndex = state.instanceIndex ?? null;
  const suffix = instanceIndex === null ? "" : `:i${instanceIndex}`;

  output.push({
    kind: "stamp",
    id: `${ownerNodeId}:${node.id}${suffix}:${sampleKind}:${stableTimeId(tSeconds)}`,
    sourceNodeId: node.id,
    ownerNodeId,
    assetId: node.assetId,
    sampleTimeSeconds: tSeconds,
    sampleKind,
    instanceIndex,
    worldMatrix,
    screenMatrix: multiplyAffine(camera.viewMatrix, worldMatrix),
    opacity,
    pass: node.pass,
    order: node.order
  });
}

function evaluateGroup(
  node: GroupNode,
  tSeconds: number,
  worldMatrix: Affine2D,
  opacity: number,
  context: EvaluationContext,
  parentState: NodeEvaluationState,
  output: EvaluatedStamp[]
): void {
  for (const child of node.children) {
    evaluateNode(child, tSeconds, context, {
      parentMatrix: worldMatrix,
      parentOpacity: opacity,
      ownerNodeId: parentState.ownerNodeId,
      instanceIndex: parentState.instanceIndex
    }, output);
  }
}

function evaluateGenerator(
  node: GeneratorNode,
  tSeconds: number,
  sampleKind: "historical" | "current",
  worldMatrix: Affine2D,
  opacity: number,
  context: EvaluationContext,
  output: EvaluatedStamp[]
): void {
  const spec = node.generator;
  for (let index = 0; index < spec.count; index++) {
    const instanceTime = tSeconds - index * spec.timeOffsetSeconds;
    const instanceMatrix = multiplyAffine(
      multiplyAffine(
        multiplyAffine(
          translation(spec.offsetX * index, spec.offsetY * index),
          rotationDeg(spec.rotationStepDeg * index)
        ),
        scale(Math.pow(spec.scaleStepX, index), Math.pow(spec.scaleStepY, index))
      ),
      IDENTITY_AFFINE
    );

    const template = node.template;
    const start = timeToSeconds(template.timing.start, context.timebase);
    const end = timeToSeconds(template.timing.end, context.timebase);
    if (!isActive(start, end, instanceTime)) continue;

    const templateTransform = evaluateTransform(template.transform, instanceTime, context.timebase);
    const templateOpacity = clamp01(evaluateTrack(template.opacity, instanceTime, context.timebase));
    const instanceWorld = multiplyAffine(multiplyAffine(worldMatrix, instanceMatrix), templateTransform.matrix);
    const camera = evaluateCamera(
      context.composition.camera,
      instanceTime,
      context.timebase,
      context.projectSeed
    );

    output.push({
      kind: "stamp",
      id: `${node.id}:${template.id}:i${index}:${sampleKind}:${stableTimeId(instanceTime)}`,
      sourceNodeId: template.id,
      ownerNodeId: node.id,
      assetId: template.assetId,
      sampleTimeSeconds: instanceTime,
      sampleKind,
      instanceIndex: index,
      worldMatrix: instanceWorld,
      screenMatrix: multiplyAffine(camera.viewMatrix, instanceWorld),
      opacity: opacity * templateOpacity,
      pass: template.pass,
      order: template.order + index * 1e-6
    });
  }
}

export function evaluateCamera(
  camera: Camera2D,
  tSeconds: number,
  timebase: Timebase,
  projectSeed: number
): EvaluatedCamera {
  const base = {
    x: evaluateTrack(camera.x, tSeconds, timebase),
    y: evaluateTrack(camera.y, tSeconds, timebase),
    rotationDeg: evaluateTrack(camera.rotationDeg, tSeconds, timebase),
    zoom: evaluateTrack(camera.zoom, tSeconds, timebase)
  };

  let x = base.x;
  let y = base.y;
  let rotation = base.rotationDeg;

  for (const modifier of camera.modifiers ?? []) {
    if (modifier.type !== "shake") continue;
    const coordinate = tSeconds * modifier.frequencyHz;
    const seed = projectSeed ^ modifier.seed;
    x += deterministicNoise(seed ^ 0x13579bdf, coordinate) * modifier.amplitudeX;
    y += deterministicNoise(seed ^ 0x2468ace0, coordinate) * modifier.amplitudeY;
    rotation += deterministicNoise(seed ^ 0x5f3759df, coordinate) * modifier.amplitudeRotationDeg;
  }

  const final = { x, y, rotationDeg: rotation, zoom: base.zoom };
  const viewMatrix = multiplyAffine(
    multiplyAffine(scale(final.zoom, final.zoom), rotationDeg(-final.rotationDeg)),
    translation(-final.x, -final.y)
  );

  return { base, final, viewMatrix };
}

export function normalizeTemporalSampling(spec: TemporalSamplingSpec): TemporalSamplingSpec {
  return {
    ...spec,
    sampleCount: Math.max(0, Math.floor(spec.sampleCount)),
    shutterSeconds: Math.max(0, spec.shutterSeconds),
    historicalOpacity: clamp01(spec.historicalOpacity)
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function stableTimeId(value: number): string {
  return Number.isFinite(value) ? value.toFixed(9) : String(value);
}
