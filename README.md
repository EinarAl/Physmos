# physmos

A 3D graphing calculator that doubles as a physics sandbox. Curves and surfaces are algebraic objects you type; point masses carry charge, drag, gravity, and user-defined forces. Press play and watch the physics, or scrub a curve to read off differential geometry.

## Features

- Expression objects: parametric curves `r(t)`, explicit surfaces `z = f(x,y)`, parametric surfaces `r(u,v)`, and point masses
- Point physics: free-body forces, mass, velocity, anchored bodies, integrated with a semi implicit Euler step
- Charge interaction: every charged point pulls on every other via Coulomb's law, with a live force arrow and adjustable `k`
- Force fields: uniform gravity (`g` in the toolbar) plus per-point linear drag `F = -c·v`, drawn as an orange free-body arrow
- Frenet frame inspector: scrub `t` along a selected curve and read the T / N / B triad with curvature and torsion computed by central differences
- Point trails: moving points trace their path through the force field, with a toolbar toggle and clear
- Playback controls: speed slider (0.2x to 2x), play/pause/reset, camera view reset, grid toggle
- Save and load scenes: export the whole scene to JSON from the toolbar and paste it back, fully client-side
- Demo scene with the built-in physics playground, reloadable in one click

## Getting started

```bash
pnpm install
pnpm dev
```

Requires Node 22+ and pnpm. Open the printed dev URL (the app listens on `localhost:5173`).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | start the Vite dev server |
| `pnpm build` | typecheck (`tsc -b`) and production build |
| `pnpm test` | 60-check logic suite over the parser, physics engine, Frenet math, trails, save/load, and store (`tsx`) |
| `pnpm lint` | oxlint |
| `pnpm preview` | serve the production build |

## Controls

- **Scene**: drag to orbit, scroll to zoom, right-drag to pan. Click an object in the view or the sidebar list to edit it.
- **Play / Reset**: the clock drives points through the force field; Reset restores edited positions and velocities.
- **Speed**: slow fast charge pairs or race a slow gravity well.
- **Trails & Grid**: toggle trail drawing and the ground grid.
- **Frame**: select a curve, enable Frame, then scrub `t` to move the Frenet triad and read `κ` / `τ`.
- **Export / Import**: the current scene as JSON; import pastes a scene file back in.
- **Demo**: reloads the built-in scene (helix, saddle, charged probe in a charge well).
- **?**: in-app help sheet with the math behind each feature.

## Project layout

- `src/engine/` — curve/surface geometry builders and the Frenet frame
- `src/physics/` — net force, Coulomb interaction, fields (gravity, drag), the semi implicit Euler integrator
- `src/scene/` — R3F scene graph, trails, save/load, demo presets
- `src/ui/` — toolbar, sidebar, editors, modals
- `tests/` — the logic suite (pure TS, no browser needed)

## Tech

React 19 · three / @react-three/fiber · zustand · expr-eval · Vite · TypeScript · pnpm (lockfile is `pnpm-lock.yaml`)