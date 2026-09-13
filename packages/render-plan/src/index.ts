import type { RenderPassName } from "@introgenerator/model";
import type { Affine2D } from "@introgenerator/semantics";
import type { EvaluatedScene } from "@introgenerator/evaluator";

export interface StampCommand {
  kind: "stamp";
  id: string;
  assetId: string;
  matrix: Affine2D;
  opacity: number;
  pass: RenderPassName;
  order: number;
  sampleTimeSeconds: number;
  sourceNodeId: string;
}

export type DrawCommand = StampCommand;

export interface RenderPlan {
  compositionId: string;
  timeSeconds: number;
  commands: DrawCommand[];
}

const DEFAULT_PASS_ORDER: readonly RenderPassName[] = [
  "background",
  "world",
  "particles",
  "effect-shadow",
  "effect-base",
  "foreground",
  "text",
  "overlay"
];

export function buildRenderPlan(
  scene: EvaluatedScene,
  passOrder: readonly RenderPassName[] = DEFAULT_PASS_ORDER
): RenderPlan {
  const passRanks = new Map<string, number>();
  passOrder.forEach((pass, index) => passRanks.set(pass, index));

  const commands: StampCommand[] = scene.stamps.map((stamp) => ({
    kind: "stamp",
    id: stamp.id,
    assetId: stamp.assetId,
    matrix: stamp.screenMatrix,
    opacity: stamp.opacity,
    pass: stamp.pass,
    order: stamp.order,
    sampleTimeSeconds: stamp.sampleTimeSeconds,
    sourceNodeId: stamp.sourceNodeId
  }));

  commands.sort((left, right) => {
    const leftPass = passRanks.get(left.pass) ?? passOrder.length;
    const rightPass = passRanks.get(right.pass) ?? passOrder.length;
    if (leftPass !== rightPass) return leftPass - rightPass;
    if (left.order !== right.order) return left.order - right.order;
    if (left.sampleTimeSeconds !== right.sampleTimeSeconds) {
      return left.sampleTimeSeconds - right.sampleTimeSeconds;
    }
    return left.id.localeCompare(right.id);
  });

  return {
    compositionId: scene.compositionId,
    timeSeconds: scene.timeSeconds,
    commands
  };
}

export { DEFAULT_PASS_ORDER };
