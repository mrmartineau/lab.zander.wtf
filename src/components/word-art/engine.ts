// WordArt engine — pure functions that turn a state object into CSS + per-letter
// transforms. Rendering lives in the Solid components; nothing here touches
// the DOM except font loading.
//
// Every letter is its own inline-block span so it can be bent onto a curve,
// waved, inflated or tapered. The gradient is painted per letter but offset by
// the letter's position (`--x`) and sized to the whole word (`--wa-w`), so it
// reads as one continuous fill across the word — just like the original.
//
// Markup per letter:
//   <span data-c="A" style="--i;--x;transform">   ← positioned, carries the
//     <span>A</span>                              ← gradient-clipped fill
//   </span>                                       ::before = outline + 3D
//
// All the per-state values are CSS custom properties on the root, and the
// structural stylesheet only depends on the animation. So changing a slider
// only rewrites a few inline styles — animations keep running.

export type FillType = 'solid' | 'linear' | 'radial' | 'conic'
export type Anim = 'none' | 'wave' | 'jelly' | 'swing' | 'float' | 'spin' | 'rainbow' | 'flow'

export interface WAState {
	text: string
	font: string
	weight: number
	size: number
	/** Letter spacing in hundredths of an em. */
	spacing: number
	fill: { type: FillType; angle: number; stops: string[]; hard: boolean }
	stroke: { width: number; color: string }
	extrude: { depth: number; angle: number; color: string }
	shadow: { x: number; y: number; blur: number; color: string }
	shape: {
		/** Total arc in degrees: + arches up, − smiles, ±360 is a full circle. */
		curve: number
		wave: number
		freq: number
		bulge: number
		taper: number
	}
	tf: { rotate: number; skew: number; tiltX: number; tiltY: number; stretch: number }
	anim: Anim
	/** Stage background (see STAGES) — part of the state so share links carry it. */
	bg: string
}

/** Stage backgrounds. The colours live in word-art.css under `[data-bg]`. */
export const STAGES = [
	{ id: 'night', label: 'Night' },
	{ id: 'sky', label: 'Sky' },
	{ id: 'paper', label: 'Paper' },
	{ id: 'grass', label: 'Grass' },
	{ id: 'checker', label: 'See-through' },
]

export const DEFAULT_STATE: WAState = {
	text: 'WordArt!',
	font: 'Luckiest Guy',
	weight: 400,
	size: 120,
	spacing: 2,
	fill: {
		type: 'linear',
		angle: 90,
		stops: ['#ff3b3b', '#ff9f1c', '#ffe23b', '#3bd16f', '#3b8bff', '#a259ff'],
		hard: false,
	},
	stroke: { width: 2, color: '#1b1340' },
	extrude: { depth: 14, angle: 50, color: '#3a2a8c' },
	shadow: { x: 0, y: 10, blur: 18, color: '#00000066' },
	shape: { curve: 70, wave: 0, freq: 1, bulge: 0, taper: 0 },
	tf: { rotate: 0, skew: 0, tiltX: 0, tiltY: 0, stretch: 1 },
	anim: 'none',
	bg: 'night',
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/* ─────────────────────────────── Fonts ─────────────────────────────── */

export const SYSTEM_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])
const fontCache = new Map<string, Promise<string | null>>()
/** The stylesheet URL that actually worked for each family (keeps the weight axis). */
const fontResolved = new Map<string, string>()

/** Stylesheet URL for a family: the one that loaded, else the plain family. */
export const resolvedFontHref = (family: string) => fontResolved.get(family) ?? fontHref(family)

export const fontHref = (family: string, axis = '') =>
	`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${axis}&display=swap`

/**
 * Load any Google Font by family name. Variable weight axis is tried first so
 * the weight slider works; static fonts fall back to the plain family. Resolves
 * to the stylesheet URL used, or null if Google doesn't know the font.
 */
export function loadFont(family: string, weight = 400): Promise<string | null> {
	family = family.trim()
	if (!family || SYSTEM_FONTS.has(family)) return Promise.resolve(null)
	let p = fontCache.get(family)
	if (!p) {
		p = (async () => {
			for (const axis of [':wght@100..900', ':wght@400;700', '']) {
				const href = fontHref(family, axis)
				try {
					const res = await fetch(href, { signal: AbortSignal.timeout(8000) })
					if (!res.ok) continue
					const link = document.createElement('link')
					link.rel = 'stylesheet'
					link.href = href
					document.head.append(link)
					fontResolved.set(family, href)
					await new Promise((r) => {
						link.onload = r
						link.onerror = r
						setTimeout(r, 8000)
					})
					return href
				} catch {
					// Google's 400s carry no CORS header, so a bad axis throws — try the next
					continue
				}
			}
			return null
		})()
		fontCache.set(family, p)
	}
	return p.then(async (href) => {
		if (href) {
			try {
				await document.fonts.load(`${weight} 64px "${family}"`)
			} catch {}
		}
		return href
	})
}

/* ─────────────────────────────── CSS ─────────────────────────────── */

const n = (v: number, d = 3) => {
	const s = v.toFixed(d).replace(/\.?0+$/, '')
	return s === '-0' ? '0' : s
}
const em = (px: number, size: number) => `${n(px / size)}em`

export function gradient(fill: WAState['fill'], loop = false): string {
	const stops = fill.stops.length ? [...fill.stops] : ['#000']
	if (fill.type === 'solid') return `linear-gradient(${stops[0]}, ${stops[0]})`
	if ((loop || fill.type === 'conic') && !fill.hard && stops[0] !== stops.at(-1)) stops.push(stops[0])
	const list = fill.hard
		? stops.map((c, i) => `${c} ${n((i / stops.length) * 100, 1)}% ${n(((i + 1) / stops.length) * 100, 1)}%`).join(', ')
		: stops.join(', ')
	if (fill.type === 'radial') return `radial-gradient(ellipse at 50% 50%, ${list})`
	if (fill.type === 'conic') return `conic-gradient(from ${fill.angle}deg at 50% 50%, ${list})`
	return `linear-gradient(${fill.angle}deg, ${list})`
}

function extrudeShadow(s: WAState): string {
	const { depth, angle, color } = s.extrude
	if (depth <= 0) return 'none'
	const rad = (angle * Math.PI) / 180
	const dx = Math.cos(rad)
	const dy = Math.sin(rad)
	const steps = Math.min(depth, 48)
	const step = depth / steps
	const out: string[] = []
	for (let i = 1; i <= steps; i++) {
		const d = i * step
		const dark = Math.round((i / steps) * 45)
		out.push(`${em(dx * d, s.size)} ${em(dy * d, s.size)} 0 color-mix(in oklab, ${color}, #000 ${dark}%)`)
	}
	return out.join(', ')
}

const wordTransform = (s: WAState) => {
	const t = s.tf
	const parts: string[] = []
	if (t.tiltX || t.tiltY) parts.push('perspective(30em)')
	if (t.tiltX) parts.push(`rotateX(${t.tiltX}deg)`)
	if (t.tiltY) parts.push(`rotateY(${t.tiltY}deg)`)
	if (t.rotate) parts.push(`rotate(${t.rotate}deg)`)
	if (t.skew) parts.push(`skewX(${t.skew}deg)`)
	if (t.stretch !== 1) parts.push(`scaleY(${t.stretch})`)
	return parts.join(' ') || 'none'
}

const dropShadow = (s: WAState) => {
	const { x, y, blur, color } = s.shadow
	// A transparent shadow keeps the filter list valid for the rainbow keyframes
	if (!x && !y && !blur) return 'drop-shadow(0 0 0 transparent)'
	return `drop-shadow(${em(x, s.size)} ${em(y, s.size)} ${em(blur, s.size)} ${color})`
}

export const ANIMS: { id: Anim; label: string; icon: string }[] = [
	{ id: 'none', label: 'Still', icon: 'ph-pause' },
	{ id: 'wave', label: 'Wave', icon: 'ph-wave-sine' },
	{ id: 'jelly', label: 'Jelly', icon: 'ph-drop' },
	{ id: 'swing', label: 'Swing', icon: 'ph-metronome' },
	{ id: 'float', label: 'Float', icon: 'ph-balloon' },
	{ id: 'spin', label: 'Spin', icon: 'ph-arrows-clockwise' },
	{ id: 'rainbow', label: 'Rainbow', icon: 'ph-rainbow' },
	{ id: 'flow', label: 'Flow', icon: 'ph-shuffle' },
]

/** Everything that varies with the state, as declarations for the root element. */
export function rootVars(s: WAState, wEm: number): Record<string, string> {
	const hasStroke = s.stroke.width > 0
	return {
		'--wa-fill': gradient(s.fill, s.anim === 'flow'),
		'--wa-w': `${n(wEm)}em`,
		'--wa-back': hasStroke ? s.stroke.color : s.extrude.depth > 0 ? s.extrude.color : 'transparent',
		'--wa-stroke': hasStroke ? `${em(s.stroke.width * 2, s.size)} ${s.stroke.color}` : '0 transparent',
		'--wa-ext': extrudeShadow(s),
		'--wa-drop': dropShadow(s),
		'font-family': SYSTEM_FONTS.has(s.font) ? s.font : `"${s.font}", sans-serif`,
		'font-size': `${s.size}px`,
		'font-weight': String(s.weight),
		'letter-spacing': `${n(s.spacing / 100)}em`,
		transform: wordTransform(s),
	}
}

/**
 * The structural stylesheet. It reads everything from the root's custom
 * properties, so it only changes when the animation does. `k` prefixes the
 * keyframe names, which are global.
 */
export function baseCss(sel: string, anim: Anim, k = 'wa'): string {
	const pad = 0.3
	const root = [
		'display: inline-block;',
		'position: relative;',
		'white-space: nowrap;',
		'line-height: 1.15;',
		'filter: var(--wa-drop);',
	]
	if (anim === 'spin') root.push(`animation: ${k}-spin 4s linear infinite;`)
	if (anim === 'float') root.push(`animation: ${k}-float 3s ease-in-out infinite;`)
	if (anim === 'rainbow') root.push(`animation: ${k}-rainbow 3s linear infinite;`)
	if (anim === 'flow') root.push(`animation: ${k}-flow 3s linear infinite;`)

	const letter = ['display: inline-block;', 'position: relative;', 'white-space: pre;']
	if (anim === 'wave') letter.push(`animation: ${k}-wave 1.4s ease-in-out infinite;`, 'animation-delay: calc(var(--i) * -0.1s);')
	if (anim === 'jelly') letter.push(`animation: ${k}-jelly 1.2s ease-in-out infinite;`, 'animation-delay: calc(var(--i) * -0.08s);')
	if (anim === 'swing') letter.push(`animation: ${k}-swing 1.6s ease-in-out infinite alternate;`, 'animation-delay: calc(var(--i) * -0.15s);')

	const shift = anim === 'flow' ? ' + var(--wa-shift) * var(--wa-w)' : ''
	let css = ''
	if (anim === 'flow') css += `@property --wa-shift {\n  syntax: '<number>';\n  inherits: true;\n  initial-value: 0;\n}\n\n`
	css += `${sel} {\n  ${root.join('\n  ')}\n}\n\n`
	css += `${sel} > span {\n  ${letter.join('\n  ')}\n}\n\n`
	css += `/* Outline + 3D extrusion sit behind the gradient fill */\n`
	css += `${sel} > span::before {\n  content: attr(data-c);\n  position: absolute;\n  inset: 0;\n  color: var(--wa-back);\n  -webkit-text-stroke: var(--wa-stroke);\n  text-shadow: var(--wa-ext);\n}\n\n`
	css += `${sel} > span > span {\n  display: block;\n  position: relative;\n  padding: ${pad}em;\n  margin: -${pad}em;\n  background: var(--wa-fill);\n  background-size: var(--wa-w) 100%;\n  background-position: calc(${pad}em - var(--x)${shift}) 0;\n  -webkit-background-clip: text;\n  background-clip: text;\n  color: transparent;\n  -webkit-text-fill-color: transparent;\n}\n`

	const kf: Partial<Record<Anim, string>> = {
		wave: `@keyframes ${k}-wave {\n  0%, 100% { translate: 0 0; }\n  50% { translate: 0 -0.22em; }\n}`,
		jelly: `@keyframes ${k}-jelly {\n  0%, 100% { scale: 1 1; }\n  30% { scale: 1.18 0.82; }\n  60% { scale: 0.9 1.14; }\n}`,
		swing: `@keyframes ${k}-swing {\n  from { rotate: -9deg; }\n  to { rotate: 9deg; }\n}`,
		float: `@keyframes ${k}-float {\n  0%, 100% { translate: 0 0; }\n  50% { translate: 0 -0.18em; }\n}`,
		spin: `@keyframes ${k}-spin {\n  to { rotate: y 360deg; }\n}`,
		rainbow: `@keyframes ${k}-rainbow {\n  from { filter: var(--wa-drop) hue-rotate(0deg); }\n  to { filter: var(--wa-drop) hue-rotate(360deg); }\n}`,
		flow: `@keyframes ${k}-flow {\n  to { --wa-shift: 1; }\n}`,
	}
	if (kf[anim]) {
		css += `\n${kf[anim]}\n\n@media (prefers-reduced-motion: reduce) {\n  ${sel}, ${sel} * { animation: none !important; }\n}\n`
	}
	return css
}

/* ───────────────────────────── Geometry ───────────────────────────── */

/** Flat layout of the word, measured from the DOM in px. */
export interface Metrics {
	lefts: number[]
	widths: number[]
	/** Word width */
	W: number
	/** Line box height */
	H: number
}

export interface LetterGeo {
	style: string
	tx: number
	ty: number
	rot: number
	sx: number
	sy: number
}

const seg =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
// Without Segmenter: keep combining marks, ZWJ emoji sequences and flag pairs
// together so one visible character never splits across letter spans.
const GRAPHEME = /\p{RI}\p{RI}|\P{M}\p{M}*(?:\u200D\P{M}\p{M}*)*|\p{M}+/gu
export const graphemes = (t: string) => (seg ? [...seg.segment(t)].map((x) => x.segment) : (t.match(GRAPHEME) ?? []))

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Work out each letter's transform from flat layout measurements (px). */
export function layout(s: WAState, m: Metrics): LetterGeo[] {
	const { lefts, widths, W } = m
	const size = s.size
	const { curve, wave, freq, bulge, taper } = s.shape
	const tp = taper / 100
	const bg = bulge / 100

	const sx: number[] = []
	const sy: number[] = []
	lefts.forEach((l, i) => {
		const t = W ? (l + widths[i] / 2) / W : 0.5
		const st = Math.max(0.15, 1 + tp * (2 * t - 1))
		sx.push(st)
		sy.push(st * Math.max(0.15, 1 + bg * Math.sin(Math.PI * t)))
	})

	// Re-pack letters after scaling so tapered words don't overlap.
	const Wn = widths.reduce((a, w, i) => a + w * sx[i], 0) || 1
	let run = 0
	const centres = widths.map((w, i) => {
		const c = run + (w * sx[i]) / 2
		run += w * sx[i]
		return c
	})

	const A = (wave / 100) * size * 0.6
	const phi = (curve * Math.PI) / 180
	const R = Math.abs(curve) < 1 ? Infinity : Wn / phi

	return lefts.map((l, i) => {
		const dx = centres[i] - Wn / 2
		let px = dx
		let py = 0
		let rot = 0
		if (R !== Infinity) {
			rot = dx / R
			px = R * Math.sin(rot)
			py = R * (1 - Math.cos(rot))
		}
		if (A) {
			const k = (2 * Math.PI * freq) / Wn
			py += A * Math.sin(k * dx)
			rot += Math.atan(A * k * Math.cos(k * dx)) * 0.6
		}
		const tx = px - (l + widths[i] / 2 - W / 2)
		const parts: string[] = []
		if (Math.abs(tx) > 0.05 || Math.abs(py) > 0.05) parts.push(`translate(${em(tx, size)}, ${em(py, size)})`)
		if (Math.abs(rot) > 0.0005) parts.push(`rotate(${n(rot, 4)}rad)`)
		if (Math.abs(sx[i] - 1) > 0.001 || Math.abs(sy[i] - 1) > 0.001) parts.push(`scale(${n(sx[i])}, ${n(sy[i])})`)
		const style = `--i:${i};--x:${em(l, size)}${parts.length ? `;transform:${parts.join(' ')}` : ''}`
		return { style, tx, ty: py, rot, sx: sx[i], sy: sy[i] }
	})
}

/**
 * Bounding box of the finished word in the root's own coordinates, worked out
 * from the layout maths rather than measured — so it ignores animation and is
 * cheap enough to run on every slider tick. 3D tilt is approximated by
 * foreshortening, which is plenty for fitting the preview.
 */
export function bounds(s: WAState, m: Metrics, geo: LetterGeo[]) {
	let x0 = Infinity
	let y0 = Infinity
	let x1 = -Infinity
	let y1 = -Infinity
	const t = s.tf
	const ox = m.W / 2
	const oy = m.H / 2
	const rr = (t.rotate * Math.PI) / 180
	const sk = Math.tan((t.skew * Math.PI) / 180)
	const cx = Math.cos((t.tiltY * Math.PI) / 180)
	const cy = Math.cos((t.tiltX * Math.PI) / 180)
	const word = (x: number, y: number) => {
		// scaleY → skewX → rotate → tilt, about the word's centre
		let px = x - ox
		let py = (y - oy) * t.stretch
		px += py * sk
		const qx = px * Math.cos(rr) - py * Math.sin(rr)
		const qy = px * Math.sin(rr) + py * Math.cos(rr)
		return [ox + qx * cx, oy + qy * cy]
	}
	const ink = s.size * 0.15
	geo.forEach((g, i) => {
		const w = m.widths[i]
		const lcx = m.lefts[i] + w / 2
		const lcy = m.H / 2
		const cos = Math.cos(g.rot)
		const sin = Math.sin(g.rot)
		// Glyph ink overshoots the line box (swashes, tall caps) — matters once rotated
		const hw = w / 2 + ink
		const hh = m.H / 2 + ink
		for (const [ax, ay] of [
			[-hw, -hh],
			[hw, -hh],
			[-hw, hh],
			[hw, hh],
		]) {
			const sxp = ax * g.sx
			const syp = ay * g.sy
			const [x, y] = word(lcx + g.tx + sxp * cos - syp * sin, lcy + g.ty + sxp * sin + syp * cos)
			x0 = Math.min(x0, x)
			x1 = Math.max(x1, x)
			y0 = Math.min(y0, y)
			y1 = Math.max(y1, y)
		}
	})
	if (!Number.isFinite(x0)) return null
	// Room for things that paint outside the letter boxes. Their offsets are in
	// the word's own axes, so run them through the same transform (sans origin).
	const offset = (x: number, y: number) => {
		const [px, py] = word(ox + x, oy + y)
		return [px - ox, py - oy]
	}
	const rad = (s.extrude.angle * Math.PI) / 180
	const sh = s.shadow.blur * 1.5
	const offsets = [
		[0, 0],
		offset(Math.cos(rad) * s.extrude.depth, Math.sin(rad) * s.extrude.depth),
		offset(s.shadow.x - sh, s.shadow.y - sh),
		offset(s.shadow.x + sh, s.shadow.y - sh),
		offset(s.shadow.x - sh, s.shadow.y + sh),
		offset(s.shadow.x + sh, s.shadow.y + sh),
	]
	const xs = offsets.map(([x]) => x)
	const ys = offsets.map(([, y]) => y)
	const st = s.stroke.width * 2
	return {
		x0: x0 + Math.min(...xs) - st,
		x1: x1 + Math.max(...xs) + st,
		y0: y0 + Math.min(...ys) - st,
		y1: y1 + Math.max(...ys) + st,
	}
}

/* ───────────────────────────── Export ───────────────────────────── */

/** Standalone, copy-pasteable HTML + CSS. */
export function exportCode(s: WAState, chars: string[], geo: LetterGeo[], wEm: number): { html: string; css: string } {
	const vars = Object.entries(rootVars(s, wEm))
		.map(([k, v]) => `  ${k}: ${v};`)
		.join('\n')
	let css = ''
	if (!SYSTEM_FONTS.has(s.font)) {
		css += `/* Keep @import at the very top of your stylesheet */\n@import url('${resolvedFontHref(s.font)}');\n\n`
	}
	css += `/* Tweak me! */\n.wordart {\n${vars}\n}\n\n${baseCss('.wordart', s.anim)}`
	const letters = chars
		.map((c, i) => {
			const e = escAttr(c)
			return `<span data-c="${e}" style="${geo[i]?.style ?? ''}" aria-hidden="true"><span>${e}</span></span>`
		})
		.join('')
	return { css, html: `<span class="wordart" role="img" aria-label="${escAttr(s.text)}">${letters}</span>` }
}

/* ───────────────────────────── Share ───────────────────────────── */

export const encodeState = (s: WAState) =>
	btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(s))))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')

export function decodeState(str: string): WAState | null {
	if (!str) return null
	try {
		const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
		const json = new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))
		return sanitise(merge(clone(DEFAULT_STATE), JSON.parse(json)))
	} catch {
		return null
	}
}

/** Slider ranges, mirrored from the editor controls. */
const RANGES: Record<string, [number, number]> = {
	weight: [100, 900],
	size: [40, 220],
	spacing: [-10, 60],
	'fill.angle': [0, 360],
	'stroke.width': [0, 12],
	'extrude.depth': [0, 48],
	'extrude.angle': [0, 359],
	'shadow.x': [-40, 40],
	'shadow.y': [-40, 40],
	'shadow.blur': [0, 60],
	'shape.curve': [-360, 360],
	'shape.wave': [0, 100],
	'shape.freq': [0.5, 4],
	'shape.bulge': [-80, 150],
	'shape.taper': [-80, 80],
	'tf.rotate': [-180, 180],
	'tf.skew': [-45, 45],
	'tf.tiltX': [-70, 70],
	'tf.tiltY': [-70, 70],
	'tf.stretch': [0.4, 2.5],
}
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FILL_TYPES: FillType[] = ['solid', 'linear', 'radial', 'conic']

/**
 * Share links are untrusted input that ends up in CSS (and in downloaded
 * files), so clamp numbers to the editor's ranges and only let through values
 * the controls themselves could produce.
 */
function sanitise(s: WAState): WAState {
	const d = DEFAULT_STATE
	for (const [path, [lo, hi]] of Object.entries(RANGES)) {
		const keys = path.split('.')
		const last = keys.pop()!
		const obj = keys.reduce<any>((o, k) => o[k], s)
		const v = obj[last]
		obj[last] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : keys.reduce<any>((o, k) => o[k], d)[last]
	}
	const colour = (v: string, fallback: string) => (HEX.test(v) ? v : fallback)
	s.fill.stops = s.fill.stops.filter((c) => HEX.test(c)).slice(0, 8)
	if (!s.fill.stops.length) s.fill.stops = [...d.fill.stops]
	if (!FILL_TYPES.includes(s.fill.type)) s.fill.type = d.fill.type
	if (!ANIMS.some((a) => a.id === s.anim)) s.anim = d.anim
	if (!STAGES.some((b) => b.id === s.bg)) s.bg = d.bg
	s.stroke.color = colour(s.stroke.color, d.stroke.color)
	s.extrude.color = colour(s.extrude.color, d.extrude.color)
	s.shadow.color = colour(s.shadow.color, d.shadow.color)
	// Font names are letters, digits, spaces and dashes — nothing that can escape a CSS string
	if (!/^[\p{L}\p{N} -]{1,60}$/u.test(s.font)) s.font = d.font
	s.text = s.text.slice(0, 48)
	return s
}

/** Deep-merge `src` onto `base`, keeping only keys `base` knows about. */
export function merge<T>(base: T, src: unknown): T {
	if (!src || typeof src !== 'object') return base
	for (const k of Object.keys(base as object) as (keyof T)[]) {
		const v = (src as T)[k]
		if (v === undefined) continue
		const b = base[k]
		if (Array.isArray(b)) base[k] = (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : b) as T[keyof T]
		else if (b && typeof b === 'object') base[k] = merge(b, v)
		else if (typeof v === typeof b) base[k] = v
	}
	return base
}
