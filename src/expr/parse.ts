import { Parser } from 'expr-eval'

export type CurveLike = { expr: string; param: string }
export type SurfaceLike =
  | { kind: 'explicit'; expr: string }
  | { kind: 'parametric'; expr: string }

const GREEK_MAP: Record<string, string> = {
  'ω': 'w',
  'π': 'PI',
  'ρ': 'rho_',
  'τ': 'tau_',
  'θ': 'theta_',
  'φ': 'phi_',
  'α': 'alpha_',
  'β': 'beta_',
  'γ': 'gamma_',
  'δ': 'delta_',
  'λ': 'lambda_',
  'σ': 'sigma_',
  'Ω': 'W',
}

export function sanitizeExpr(s: string): string {
  let out = s
  for (const [g, l] of Object.entries(GREEK_MAP)) {
    out = out.split(g).join(l)
  }
  return out
}

function unwrapOuterParens(s: string): string {
  const t = s.trim()
  if (!t.startsWith('(')) return t
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (ch === '(' && i > 0) depth++
    else if (ch === ')') {
      if (depth === 0 && i === t.length - 1) return t.slice(1, -1).trim()
      depth--
    }
  }
  return t
}

export function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of unwrapOuterParens(s)) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    if (ch === sep && depth === 0) {
      parts.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  parts.push(cur)
  return parts
}

export function parseParams(raw: string): Record<string, number> {
  const out: Record<string, number> = { pi: Math.PI, e: Math.E }
  if (!raw) return out
  for (const chunk of splitTopLevel(raw, ',')) {
    const eq = chunk.indexOf('=')
    if (eq < 0) continue
    const key = sanitizeExpr(chunk.slice(0, eq)).trim()
    const val = Number(chunk.slice(eq + 1).trim())
    if (key && Number.isFinite(val)) out[key] = val
  }
  return out
}

function evalParts(expr: string, vars: Record<string, number>): number[] {
  const parser = new Parser()
  return splitTopLevel(expr, ',').map((comp) =>
    parser.parse(comp.trim()).evaluate(vars),
  )
}

export function evalComponents(expr: string, vars: Record<string, number>): number[] {
  return evalParts(sanitizeExpr(expr), vars)
}

export function evalScalar(expr: string, vars: Record<string, number>): number {
  return evalComponents(expr, vars)[0]
}

export function varsOf(expr: string): Set<string> {
  const parser = new Parser()
  const out = new Set<string>()
  for (const comp of splitTopLevel(expr, ',')) {
    try {
      for (const v of parser.parse(comp.trim()).variables()) out.add(v)
    } catch {
      // leaves the set incomplete; decay to empty
    }
  }
  return out
}

function hasAny(vars: Set<string>, names: string[]): boolean {
  return names.some((n) => vars.has(n))
}

export type Classified =
  | { type: 'point'; expr: string }
  | { type: 'curve'; expr: string }
  | { type: 'parametric'; expr: string }
  | { type: 'explicit'; expr: string }
  | { type: 'invalid'; reason: string }

export function classify(expr: string): Classified {
  const clean = sanitizeExpr(expr)
  const parts = splitTopLevel(clean, ',')
  const vars = varsOf(clean)

  if (expr.trim() === '') return { type: 'invalid', reason: 'empty expression' }

  if (parts.length === 3) {
    if (hasAny(vars, ['u', 'v'])) return { type: 'parametric', expr: clean }
    if (hasAny(vars, ['t'])) return { type: 'curve', expr: clean }
    if (hasAny(vars, ['x', 'y'])) return { type: 'explicit', expr: clean }
    if (vars.size === 0) return { type: 'point', expr: clean }
    return { type: 'invalid', reason: 'unknown variables in triple' }
  }

  if (parts.length === 1 || parts.length === 2) {
    if (hasAny(vars, ['x', 'y']) && !hasAny(vars, ['t', 'u', 'v'])) {
      return { type: 'explicit', expr: clean }
    }
  }

  if (parts.length < 3 && vars.size === 0) {
    return { type: 'point', expr: clean }
  }

  return { type: 'invalid', reason: 'expect (fx,fy,fz) or f(x,y)' }
}