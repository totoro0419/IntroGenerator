import type {
  AuthoringProject,
  Composition,
  NumberTrack,
  SceneNode,
  Timebase,
  TimeValue
} from "@introgenerator/model";
import { timeToSeconds } from "@introgenerator/semantics";

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function validateProject(project: AuthoringProject): ValidationResult {
  const issues: ValidationIssue[] = [];
  const compositionIds = new Set<string>();
  const assetIds = new Set(project.assets.map((asset) => asset.id));

  for (const [index, composition] of project.compositions.entries()) {
    const path = `compositions[${index}]`;
    if (compositionIds.has(composition.id)) {
      error(issues, "DUPLICATE_COMPOSITION_ID", `${path}.id`, `Duplicate composition id: ${composition.id}`);
    }
    compositionIds.add(composition.id);
    validateComposition(composition, path, assetIds, issues);
  }

  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}

function validateComposition(
  composition: Composition,
  path: string,
  assetIds: Set<string>,
  issues: ValidationIssue[]
): void {
  if (!(composition.width > 0) || !(composition.height > 0)) {
    error(issues, "INVALID_DIMENSIONS", path, "Composition width and height must be positive.");
  }
  validateTimebase(composition.timebase, `${path}.timebase`, issues);

  const duration = safeTimeToSeconds(composition.duration, composition.timebase, `${path}.duration`, issues);
  if (duration !== null && !(duration > 0)) {
    error(issues, "INVALID_DURATION", `${path}.duration`, "Composition duration must be positive.");
  }

  const nodeIds = new Set<string>();
  composition.nodes.forEach((node, index) =>
    validateNode(node, `${path}.nodes[${index}]`, composition.timebase, assetIds, nodeIds, issues)
  );
}

function validateTimebase(timebase: Timebase, path: string, issues: ValidationIssue[]): void {
  if (!Number.isFinite(timebase.fps) || timebase.fps <= 0) {
    error(issues, "INVALID_FPS", `${path}.fps`, "FPS must be a positive finite number.");
  }
  if (timebase.tempoMap.length === 0) {
    error(issues, "EMPTY_TEMPO_MAP", `${path}.tempoMap`, "Tempo map must contain at least one segment.");
    return;
  }

  let lastBeat = -Infinity;
  let lastSeconds = -Infinity;
  for (const [index, segment] of timebase.tempoMap.entries()) {
    const segmentPath = `${path}.tempoMap[${index}]`;
    if (!(segment.bpm > 0) || !Number.isFinite(segment.bpm)) {
      error(issues, "INVALID_BPM", `${segmentPath}.bpm`, "BPM must be a positive finite number.");
    }
    if (segment.startBeat < lastBeat || segment.startSeconds < lastSeconds) {
      error(issues, "UNSORTED_TEMPO_MAP", segmentPath, "Tempo segments must be monotonic in beat and seconds.");
    }
    lastBeat = segment.startBeat;
    lastSeconds = segment.startSeconds;
  }
}

function validateNode(
  node: SceneNode,
  path: string,
  timebase: Timebase,
  assetIds: Set<string>,
  nodeIds: Set<string>,
  issues: ValidationIssue[]
): void {
  if (nodeIds.has(node.id)) {
    error(issues, "DUPLICATE_NODE_ID", `${path}.id`, `Duplicate node id: ${node.id}`);
  }
  nodeIds.add(node.id);

  const start = safeTimeToSeconds(node.timing.start, timebase, `${path}.timing.start`, issues);
  const end = safeTimeToSeconds(node.timing.end, timebase, `${path}.timing.end`, issues);
  if (start !== null && end !== null && !(start < end)) {
    error(issues, "INVALID_ACTIVE_RANGE", `${path}.timing`, "Node active range must satisfy start < end; semantics are [start, end)." );
  }

  validateTrack(node.opacity, `${path}.opacity`, timebase, issues);
  for (const [key, track] of Object.entries(node.transform)) {
    validateTrack(track, `${path}.transform.${key}`, timebase, issues);
  }

  if (node.temporalSampling) {
    const spec = node.temporalSampling;
    if (!Number.isInteger(spec.sampleCount) || spec.sampleCount < 0) {
      error(issues, "INVALID_TEMPORAL_SAMPLE_COUNT", `${path}.temporalSampling.sampleCount`, "sampleCount must be a non-negative integer.");
    }
    if (!Number.isFinite(spec.shutterSeconds) || spec.shutterSeconds < 0) {
      error(issues, "INVALID_SHUTTER", `${path}.temporalSampling.shutterSeconds`, "shutterSeconds must be finite and non-negative.");
    }
    if (spec.historicalOpacity < 0 || spec.historicalOpacity > 1) {
      error(issues, "INVALID_HISTORICAL_OPACITY", `${path}.temporalSampling.historicalOpacity`, "historicalOpacity must be in [0, 1].");
    }
  }

  switch (node.type) {
    case "stamp":
      if (!assetIds.has(node.assetId)) {
        error(issues, "MISSING_ASSET", `${path}.assetId`, `Asset not found: ${node.assetId}`);
      }
      break;
    case "group":
      node.children.forEach((child, index) =>
        validateNode(child, `${path}.children[${index}]`, timebase, assetIds, nodeIds, issues)
      );
      break;
    case "generator":
      validateGenerator(node.generator, `${path}.generator`, timebase, issues);
      validateNode(node.template, `${path}.template`, timebase, assetIds, nodeIds, issues);
      break;
  }
}

function validateGenerator(
  generator: Extract<SceneNode, { type: "generator" }>["generator"],
  path: string,
  timebase: Timebase,
  issues: ValidationIssue[]
): void {
  switch (generator.type) {
    case "repeater":
      if (!Number.isInteger(generator.count) || generator.count < 0) {
        error(issues, "INVALID_GENERATOR_COUNT", `${path}.count`, "Generator count must be a non-negative integer.");
      }
      if (!Number.isFinite(generator.timeOffsetSeconds)) {
        error(issues, "INVALID_GENERATOR_TIME_OFFSET", `${path}.timeOffsetSeconds`, "timeOffsetSeconds must be finite.");
      }
      return;
    case "periodic":
    case "particle":
      validateTrack(generator.progress, `${path}.progress`, timebase, issues);
      if (!Number.isFinite(generator.max) || generator.max < 0) {
        error(issues, "INVALID_GENERATOR_MAX", `${path}.max`, "Indexed generator max must be finite and non-negative.");
      }
      if (!Number.isFinite(generator.interval) || generator.interval <= 0) {
        error(issues, "INVALID_GENERATOR_INTERVAL", `${path}.interval`, "Indexed generator interval must be finite and positive.");
      }
      if (generator.type === "particle") {
        if (!Number.isFinite(generator.radiusScale)) {
          error(issues, "INVALID_PARTICLE_RADIUS_SCALE", `${path}.radiusScale`, "radiusScale must be finite.");
        }
        if (!Number.isFinite(generator.rotationPerPhaseDeg)) {
          error(issues, "INVALID_PARTICLE_ROTATION", `${path}.rotationPerPhaseDeg`, "rotationPerPhaseDeg must be finite.");
        }
      }
      return;
  }
}

function validateTrack(track: NumberTrack, path: string, timebase: Timebase, issues: ValidationIssue[]): void {
  if (!Number.isFinite(track.defaultValue)) {
    error(issues, "NON_FINITE_TRACK_DEFAULT", `${path}.defaultValue`, "Track default must be finite.");
  }
  if (!track.keyframes) return;

  let previous = -Infinity;
  for (const [index, keyframe] of track.keyframes.entries()) {
    const time = safeTimeToSeconds(keyframe.time, timebase, `${path}.keyframes[${index}].time`, issues);
    if (time !== null) {
      if (time < previous) {
        error(issues, "UNSORTED_KEYFRAMES", `${path}.keyframes[${index}]`, "Keyframes must be sorted by normalized time.");
      }
      previous = time;
    }
    if (!Number.isFinite(keyframe.value)) {
      error(issues, "NON_FINITE_KEYFRAME_VALUE", `${path}.keyframes[${index}].value`, "Keyframe value must be finite.");
    }
  }
}

function safeTimeToSeconds(
  value: TimeValue,
  timebase: Timebase,
  path: string,
  issues: ValidationIssue[]
): number | null {
  if (!Number.isFinite(value.value)) {
    error(issues, "NON_FINITE_TIME", path, "Time value must be finite.");
    return null;
  }
  try {
    return timeToSeconds(value, timebase);
  } catch (cause) {
    error(issues, "TIME_NORMALIZATION_FAILED", path, cause instanceof Error ? cause.message : "Time normalization failed.");
    return null;
  }
}

function error(issues: ValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ severity: "error", code, path, message });
}
