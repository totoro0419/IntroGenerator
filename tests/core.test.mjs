import test from "node:test";
import assert from "node:assert/strict";
import { coreFixtureProject } from "../packages/fixtures/dist/index.js";
import {
  beatToSeconds,
  cubicBezierYForX,
  isActive,
  timeToSeconds
} from "../packages/semantics/dist/index.js";
import { evaluateComposition } from "../packages/evaluator/dist/index.js";
import { buildRenderPlan } from "../packages/render-plan/dist/index.js";
import { validateProject } from "../packages/validation/dist/index.js";

const composition = coreFixtureProject.compositions[0];

// PDF-COMPAT-01: BPM/beat time normalization.
test("PDF-COMPAT-01 beat time normalizes to seconds", () => {
  assert.equal(beatToSeconds(1, composition.timebase.tempoMap), 0.5);
  assert.equal(timeToSeconds({ unit: "beats", value: 4 }, composition.timebase), 2);
});

// Contract: ranges are half-open [start, end).
test("active ranges use [start, end) semantics", () => {
  assert.equal(isActive(1, 2, 1), true);
  assert.equal(isActive(1, 2, 1.999), true);
  assert.equal(isActive(1, 2, 2), false);
});

// PDF-COMPAT-02: easing is deterministic and bounded at endpoints.
test("PDF-COMPAT-02 cubic bezier preserves endpoints", () => {
  assert.equal(cubicBezierYForX(0, 0.25, 0.1, 0.25, 1), 0);
  assert.equal(cubicBezierYForX(1, 0.25, 0.1, 0.25, 1), 1);
  const mid = cubicBezierYForX(0.5, 0.25, 0.1, 0.25, 1);
  assert.ok(mid > 0 && mid < 1);
});

// PDF-COMPAT-03/04: camera is re-evaluated per temporal sample, not copied from current time.
test("PDF-COMPAT-03/04 temporal samples re-evaluate animated camera", () => {
  const scene = evaluateComposition(coreFixtureProject, "intro", 1);
  const title = scene.stamps.filter((stamp) => stamp.sourceNodeId === "title-stamp");
  assert.equal(title.length, 3);
  assert.deepEqual(title.map((stamp) => stamp.sampleKind), ["historical", "historical", "current"]);
  assert.notEqual(title[0].screenMatrix.e, title[2].screenMatrix.e);
  assert.equal(title[0].opacity < title[2].opacity, true);
});

// Generator contract: no persistent particles/instances are required for deterministic reconstruction.
test("repeater reconstructs identical instances at arbitrary time", () => {
  const first = evaluateComposition(coreFixtureProject, "intro", 1.25);
  const second = evaluateComposition(coreFixtureProject, "intro", 1.25);
  const a = first.stamps.filter((stamp) => stamp.ownerNodeId === "dots");
  const b = second.stamps.filter((stamp) => stamp.ownerNodeId === "dots");
  assert.equal(a.length, 3);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((stamp) => stamp.instanceIndex), [0, 1, 2]);
});

// PDF-COMPAT-10: pass ordering is explicit rather than hard-coded into evaluator behavior.
test("PDF-COMPAT-10 render plan respects compatibility pass order", () => {
  const scene = evaluateComposition(coreFixtureProject, "intro", 1);
  const plan = buildRenderPlan(scene);
  const firstTextIndex = plan.commands.findIndex((command) => command.pass === "text");
  const lastParticleIndex = plan.commands.map((command) => command.pass).lastIndexOf("particles");
  assert.ok(lastParticleIndex >= 0);
  assert.ok(firstTextIndex > lastParticleIndex);
});

test("core fixture validates", () => {
  const result = validateProject(coreFixtureProject);
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.issues, []);
});
