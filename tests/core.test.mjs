import test from "node:test";
import assert from "node:assert/strict";
import { coreFixtureProject } from "../packages/fixtures/dist/index.js";
import {
  GOLDEN_RATIO_CONJUGATE,
  activeIdRange,
  beatToSeconds,
  cubicBezierYForX,
  enumerateIdRange,
  goldenRatioPhase,
  isActive,
  timeToSeconds
} from "../packages/semantics/dist/index.js";
import { evaluateComposition } from "../packages/evaluator/dist/index.js";
import { buildRenderPlan, DEFAULT_PASS_ORDER } from "../packages/render-plan/dist/index.js";
import { validateProject } from "../packages/validation/dist/index.js";

const composition = coreFixtureProject.compositions[0];
const approx = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

// PDF-COMPAT-01: Scratch timer -> offset -> BPM/60 has the same beat/seconds meaning.
test("PDF-COMPAT-01 beat time normalizes to seconds", () => {
  assert.equal(beatToSeconds(1, composition.timebase.tempoMap), 0.5);
  assert.equal(timeToSeconds({ unit: "beats", value: 4 }, composition.timebase), 2);
});

test("active ranges use canonical [start, end) semantics", () => {
  assert.equal(isActive(1, 2, 1), true);
  assert.equal(isActive(1, 2, 1.999), true);
  assert.equal(isActive(1, 2, 2), false);
});

// PDF-COMPAT-02: normalized easing remains deterministic and endpoint-correct.
test("PDF-COMPAT-02 cubic bezier preserves endpoints", () => {
  assert.equal(cubicBezierYForX(0, 0.25, 0.1, 0.25, 1), 0);
  assert.equal(cubicBezierYForX(1, 0.25, 0.1, 0.25, 1), 1);
  const mid = cubicBezierYForX(0.5, 0.25, 0.1, 0.25, 1);
  assert.ok(mid > 0 && mid < 1);
});

// PDF-COMPAT-03: base camera is evaluated before additive shake modifiers.
test("PDF-COMPAT-03 camera base precedes shake modifiers", () => {
  const camera = evaluateComposition(coreFixtureProject, "intro", 1).camera;
  assert.equal(camera.base.x, 50);
  assert.equal(camera.base.y, 0);
  assert.equal(camera.base.rotationDeg, 0);
  assert.ok(Math.abs(camera.final.x - camera.base.x) <= 2);
  assert.ok(Math.abs(camera.final.y - camera.base.y) <= 1);
  assert.ok(Math.abs(camera.final.rotationDeg - camera.base.rotationDeg) <= 0.2);
});

// PDF-COMPAT-04: 20 historical samples over 0.1 s, then the current sharp base.
test("PDF-COMPAT-04 text temporal samples re-evaluate camera and end with sharp current base", () => {
  const scene = evaluateComposition(coreFixtureProject, "intro", 1);
  const title = scene.stamps.filter((stamp) => stamp.sourceNodeId === "title-stamp");
  assert.equal(title.length, 21);
  assert.equal(title.filter((stamp) => stamp.sampleKind === "historical").length, 20);
  assert.equal(title.at(-1).sampleKind, "current");
  approx(title[0].sampleTimeSeconds, 0.9);
  approx(title.at(-1).sampleTimeSeconds, 1);
  assert.notEqual(title[0].screenMatrix.e, title.at(-1).screenMatrix.e);
  assert.ok(title[0].opacity < title.at(-1).opacity);
});

test("repeater reconstructs identical instances at arbitrary time", () => {
  const first = evaluateComposition(coreFixtureProject, "intro", 1.25);
  const second = evaluateComposition(coreFixtureProject, "intro", 1.25);
  const a = first.stamps.filter((stamp) => stamp.ownerNodeId === "dots");
  const b = second.stamps.filter((stamp) => stamp.ownerNodeId === "dots");
  assert.equal(a.length, 3);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((stamp) => stamp.instanceIndex), [0, 1, 2]);
});

// PDF-COMPAT-05: finite visible ID window, never an actually-infinite object list.
test("PDF-COMPAT-05 background visible ID window matches PDF formula", () => {
  const range = activeIdRange(225, 400, 50);
  assert.deepEqual(range, { startId: -4, endIdExclusive: 5, count: 9 });
  assert.deepEqual(enumerateIdRange(range), [-4, -3, -2, -1, 0, 1, 2, 3, 4]);
  const scene = evaluateComposition(coreFixtureProject, "intro", 1);
  const ids = scene.stamps
    .filter((stamp) => stamp.ownerNodeId === "pdf-background")
    .map((stamp) => stamp.instanceIndex);
  assert.deepEqual(ids, [-4, -3, -2, -1, 0, 1, 2, 3, 4]);
});

// PDF-COMPAT-06: no particle object history is required; same t reconstructs same IDs and transforms.
test("PDF-COMPAT-06 particle reconstruction is deterministic at arbitrary time", () => {
  const first = evaluateComposition(coreFixtureProject, "intro", 1.234567);
  const second = evaluateComposition(coreFixtureProject, "intro", 1.234567);
  const a = first.stamps.filter((stamp) => stamp.ownerNodeId === "pdf-particles");
  const b = second.stamps.filter((stamp) => stamp.ownerNodeId === "pdf-particles");
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
});

// PDF-COMPAT-07: q = frac(ID * (sqrt(5)-1)/2), then polar x/y and 0.3*phase rotation.
test("PDF-COMPAT-07 golden-ratio particle phase and polar placement", () => {
  const id = 1;
  approx(goldenRatioPhase(id), GOLDEN_RATIO_CONJUGATE);
  const scene = evaluateComposition(coreFixtureProject, "intro", 0.5);
  const particle = scene.stamps.find((stamp) => stamp.ownerNodeId === "pdf-particles" && stamp.instanceIndex === id);
  assert.ok(particle);
  const phase = 50 - 25 * id;
  const angle = goldenRatioPhase(id) * Math.PI * 2;
  approx(particle.worldMatrix.e, Math.cos(angle) * phase);
  approx(particle.worldMatrix.f, Math.sin(angle) * phase);
  approx(Math.atan2(particle.worldMatrix.b, particle.worldMatrix.a) * 180 / Math.PI, 0.3 * phase, 1e-8);
});

// PDF-COMPAT-09: shadow pass is globally before base pass.
test("PDF-COMPAT-09 effect shadow pass sorts before effect base pass", () => {
  assert.ok(DEFAULT_PASS_ORDER.indexOf("effect-shadow") < DEFAULT_PASS_ORDER.indexOf("effect-base"));
  const plan = buildRenderPlan(evaluateComposition(coreFixtureProject, "intro", 1));
  const shadow = plan.commands.findIndex((command) => command.sourceNodeId === "effect-shadow-fixture");
  const base = plan.commands.findIndex((command) => command.sourceNodeId === "effect-base-fixture");
  assert.ok(shadow >= 0 && base > shadow);
});

// PDF-COMPAT-10: compatibility order is a preset of the generic pass system.
test("PDF-COMPAT-10 Background -> Particle -> Effect -> Text compatibility order", () => {
  const plan = buildRenderPlan(evaluateComposition(coreFixtureProject, "intro", 1));
  const first = (pass) => plan.commands.findIndex((command) => command.pass === pass);
  assert.ok(first("background") >= 0);
  assert.ok(first("background") < first("particles"));
  assert.ok(first("particles") < first("effect-shadow"));
  assert.ok(first("effect-shadow") < first("effect-base"));
  assert.ok(first("effect-base") < first("text"));
});

test("core fixture validates", () => {
  const result = validateProject(coreFixtureProject);
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.issues, []);
});
