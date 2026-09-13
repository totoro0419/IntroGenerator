import {
  beats,
  constantTrack,
  identityTransform,
  seconds,
  type AuthoringProject,
  type GeneratorNode,
  type StampNode
} from "@introgenerator/model";

const animatedStamp: StampNode = {
  type: "stamp",
  id: "title-stamp",
  assetId: "title",
  timing: { start: beats(0), end: beats(8) },
  transform: {
    ...identityTransform(),
    x: {
      defaultValue: -400,
      keyframes: [
        { time: beats(0), value: -400, easing: { type: "cubic-bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } },
        { time: beats(2), value: 0 }
      ]
    }
  },
  opacity: {
    defaultValue: 0,
    keyframes: [
      { time: beats(0), value: 0 },
      { time: beats(2), value: 1 }
    ]
  },
  pass: "text",
  order: 10,
  temporalSampling: {
    sampleCount: 2,
    shutterSeconds: 0.1,
    distribution: "uniform",
    historicalOpacity: 0.25,
    includeCurrent: true
  }
};

const repeater: GeneratorNode = {
  type: "generator",
  id: "dots",
  timing: { start: seconds(0), end: seconds(4) },
  transform: identityTransform(),
  opacity: constantTrack(1),
  pass: "particles",
  order: 0,
  generator: {
    type: "repeater",
    count: 3,
    offsetX: 30,
    offsetY: 0,
    rotationStepDeg: 15,
    scaleStepX: 0.9,
    scaleStepY: 0.9,
    timeOffsetSeconds: 0.05
  },
  template: {
    type: "stamp",
    id: "dot-template",
    assetId: "dot",
    timing: { start: seconds(0), end: seconds(4) },
    transform: identityTransform(),
    opacity: constantTrack(0.8),
    pass: "particles",
    order: 2
  }
};

export const coreFixtureProject: AuthoringProject = {
  version: 1,
  seed: 20260912,
  assets: [
    { id: "title", kind: "svg", source: "fixtures/title.svg" },
    { id: "dot", kind: "svg", source: "fixtures/dot.svg" }
  ],
  compositions: [
    {
      id: "intro",
      name: "Core vertical slice",
      width: 1920,
      height: 1080,
      duration: beats(8),
      timebase: {
        fps: 60,
        tempoMap: [{ startBeat: 0, startSeconds: 0, bpm: 120 }]
      },
      camera: {
        x: {
          defaultValue: 0,
          keyframes: [
            { time: seconds(0), value: 0 },
            { time: seconds(2), value: 100 }
          ]
        },
        y: constantTrack(0),
        rotationDeg: constantTrack(0),
        zoom: constantTrack(1),
        modifiers: [
          {
            type: "shake",
            seed: 7,
            frequencyHz: 8,
            amplitudeX: 2,
            amplitudeY: 1,
            amplitudeRotationDeg: 0.2
          }
        ]
      },
      nodes: [repeater, animatedStamp]
    }
  ]
};
