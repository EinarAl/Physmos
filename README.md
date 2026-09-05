# physmos

3D graphing calculator and physics sandbox.

- Expression objects: parametric curves `r(t)`, explicit surfaces `z = f(x,y)`, parametric surfaces `r(u,v)`, and point mass particles
- Point physics: free-body forces, mass, velocity, anchored bodies, integrated with a semi implicit Euler step
- Charge interaction: every charged point pulls on every other via Coulomb's law, with a live force arrow and adjustable `k`
- Frenet frame inspector: scrub `t` along a selected curve and read the T / N / B triad with curvature and torsion computed by central differences

```bash
pnpm install
pnpm dev
```

Requires Node 22+ and pnpm.