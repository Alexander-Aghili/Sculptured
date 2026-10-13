# General mathematical WebGPU engine · 0.1.0

The engine is shared across all courses and modules. It renders mathematical data; it does not certify mathematical claims. World coordinates are right-handed, units belong to the module, the camera is orthographic and depth is mapped to WebGPU's [0,1]. `span` is the vertical world extent; visible depth extends roughly 10 spans either side of the camera center.

```ts
import { WebGPUEngine } from './WebGPUEngine';
import { curve, surface, DEFAULT_CAMERA } from './geometry';
const engine = await WebGPUEngine.create(canvas, showVisibleError);
engine.setScene([
  curve(t => [Math.cos(t), Math.sin(t), t / 4], [0, 4 * Math.PI]),
  surface((u,v) => [u,v,0], [-1,1], [-1,1], 20),
]);
engine.setCamera({ ...DEFAULT_CAMERA, yaw: 0.7 });
// Call render() on ResizeObserver changes; dispose() on unmount.
```

Supported: colored line segments, triangle meshes, parameter curves/surfaces, depth occlusion, orbit angles, zoom/center, resize, explicit cleanup and device-loss reporting. Render on parameter changes; there is no permanent animation loop. A scene allows at most 300,000 vertices. Split singular domains explicitly; invalid/non-finite geometry is rejected.

Not yet supported: indexed mesh buffers, lighting/normals, labels/picking, transparency ordering, adaptive tessellation, perspective camera and volumetric rendering. Color alpha is accepted but the canvas/pipeline is opaque; use alpha 1. Do not pretend these capabilities exist. Request justified extensions from Engine support with a minimal use case, current API version and acceptance checks. Engine creator owns shared engine changes, Engine verifier checks the revision, support replies with docs/examples and the requesting visualizer confirms integration. Record requests under docs/engine/support. Keep APIs general and update this capability list and examples when extending them.

The module owns accessible controls (yaw/pitch/zoom inputs plus reset), mathematical explanations, axis/units labels and an always-available text/table fallback. Catch initialization failure and show the explanation without a canvas. WebGPU needs a compatible browser/adapter and a secure context (localhost development is supported); absence is not a passing GPU test. Do not claim browser/GPU validation from CPU tests.

Run `npm test` and `npm run build`; then run a real browser smoke test covering two overlapping surfaces, a spatial curve, resize, controls, disposal and unavailable-device behavior. Save exact revision, commands, captures and unrun checks under docs/engine/checks.

API references: [WebGPU specification](https://www.w3.org/TR/webgpu/), [canvas configuration](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure), [device creation](https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter/requestDevice).
