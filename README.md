# IntroGenerator

IntroGenerator is a deterministic motion-graphics authoring and compilation pipeline targeting both an independent Web renderer and Scratch 3.

## Architecture

The implementation deliberately separates editing semantics from backend constraints:

```text
Editor
  -> Authoring Graph (`@introgenerator/model`)
  -> Semantic normalization (`@introgenerator/semantics`)
  -> Pure arbitrary-time evaluation (`@introgenerator/evaluator`)
  -> Backend-neutral Render Plan (`@introgenerator/render-plan`)
  -> Web backend / Scratch backend (next milestones)
```

The evaluator is designed so the same `project + time + seed` produces the same result without replaying prior frames. Scratch-specific lists, variables and My Blocks do not leak into the authoring model.

## Current milestone

This bootstrap implements the first vertical core slice:

- seconds / beats / frames authoring time
- tempo-map normalization
- `[start, end)` visibility semantics
- animated numeric tracks and cubic-bezier easing
- 2D transforms and camera evaluation
- deterministic camera shake modifier
- temporal sampling for trails / blur-like effects
- deterministic repeater expansion
- shared finite indexed-ID generator windows
- periodic / infinite-scroll generator reconstruction
- deterministic golden-ratio particle reconstruction
- backend-neutral stamp Render Plan
- semantic validation
- executable compatibility fixtures

## Commands

```bash
npm run typecheck
npm test
```

No Web editor UI has been implemented yet. UI work will be a later layer on top of this contract.
