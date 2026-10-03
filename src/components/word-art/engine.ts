// WordArt engine — turns a plain state object into per-letter HTML + CSS.
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

export type FillType = 'solid' | 'linear' | 'radial' | 'conic'
export type Anim =
	| 'none'
	| 'wave'
	| 'jelly'
	| 'swing'
	| 'float'
	| 'spin'
	| 'rainbow'
	| 'flow'

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
	tf: {
		rotate: number
		skew: number
		tiltX: number
		tiltY: number
		stretch: number
	}
	anim: Anim
}

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
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/* ─────────────────────────────── Fonts ─────────────────────────────── */

const SYSTEM_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])
const fontCache = new Map<string, Promise<string | null>>()
/** The stylesheet URL that actually worked for each family (keeps the weight axis). */
const fontResolved = new Map<string, string>()

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
	let stops = fill.stops.length ? [...fill.stops] : ['#000']
	if (fill.type === 'solid') return `linear-gradient(${stops[0]}, ${stops[0]})`
	if ((loop || fill.type === 'conic') && !fill.hard && stops[0] !== stops.at(-1)) stops.push(stops[0])
	const list = fill.hard
		? stops
				.map((c, i) => `${c} ${n((i / stops.length) * 100, 1)}% ${n(((i + 1) / stops.length) * 100, 1)}%`)
				.join(', ')
		: stops.join(', ')
	if (fill.type === 'radial') return `radial-gradient(ellipse at 50% 50%, ${list})`
	if (fill.type === 'conic') return `conic-gradient(from ${fill.angle}deg at 50% 50%, ${list})`
	return `linear-gradient(${fill.angle}deg, ${list})`
}

function extrudeShadow(s: WAState): string {
	const { depth, angle, color } = s.extrude
	if (depth <= 0) return ''
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
	return out.join(',\n    ')
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
	return parts.join(' ')
}

const dropShadow = (s: WAState) => {
	const { x, y, blur, color } = s.shadow
	if (!x && !y && !blur) return ''
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

/** The full stylesheet for one piece of WordArt under `sel`. */
export function cssFor(s: WAState, sel: string, wEm: number, opts: { imports?: boolean; kf?: string } = {}): string {
	// Keyframe names are global, so previews get their own prefix
	const k = opts.kf ?? 'wa'
	const font = SYSTEM_FONTS.has(s.font) ? s.font : `"${s.font}", sans-serif`
	const tf = wordTransform(s)
	const drop = dropShadow(s)
	const ext = extrudeShadow(s)
	const hasBack = s.stroke.width > 0 || s.extrude.depth > 0
	const backColor = s.stroke.width > 0 ? s.stroke.color : s.extrude.color
	const pad = 0.3
	const anim = s.anim

	const root: string[] = [
		`--wa-fill: ${gradient(s.fill, anim === 'flow')};`,
		`--wa-w: ${n(wEm)}em;`,
		`display: inline-block;`,
		`position: relative;`,
		`white-space: nowrap;`,
		`line-height: 1.15;`,
		`font-family: ${font};`,
		`font-size: ${s.size}px;`,
		`font-weight: ${s.weight};`,
		`letter-spacing: ${n(s.spacing / 100)}em;`,
	]
	if (tf) root.push(`transform: ${tf};`)
	if (drop) root.push(`filter: ${drop};`)
	if (anim === 'spin') root.push(`animation: ${k}-spin 4s linear infinite;`)
	if (anim === 'float') root.push(`animation: ${k}-float 3s ease-in-out infinite;`)
	if (anim === 'rainbow') root.push(`animation: ${k}-rainbow 3s linear infinite;`)
	if (anim === 'flow') root.push(`animation: ${k}-flow 3s linear infinite;`)

	const letter = [`display: inline-block;`, `position: relative;`, `white-space: pre;`]
	if (anim === 'wave') letter.push(`animation: ${k}-wave 1.4s ease-in-out infinite;`, `animation-delay: calc(var(--i) * -0.1s);`)
	if (anim === 'jelly') letter.push(`animation: ${k}-jelly 1.2s ease-in-out infinite;`, `animation-delay: calc(var(--i) * -0.08s);`)
	if (anim === 'swing') letter.push(`animation: ${k}-swing 1.6s ease-in-out infinite alternate;`, `animation-delay: calc(var(--i) * -0.15s);`)

	const shift = anim === 'flow' ? ' + var(--wa-shift) * var(--wa-w)' : ''
	let css = ''
	if (opts.imports && !SYSTEM_FONTS.has(s.font)) css += `/* Keep @import at the very top of your stylesheet */\n@import url('${fontResolved.get(s.font) ?? fontHref(s.font)}');\n\n`
	if (anim === 'flow') css += `@property --wa-shift {\n  syntax: '<number>';\n  inherits: true;\n  initial-value: 0;\n}\n\n`
	css += `${sel} {\n  ${root.join('\n  ')}\n}\n\n`
	css += `${sel} > span {\n  ${letter.join('\n  ')}\n}\n\n`
	if (hasBack) {
		css += `/* Outline + 3D extrusion sit behind the gradient fill */\n`
		css += `${sel} > span::before {\n  content: attr(data-c);\n  position: absolute;\n  inset: 0;\n  color: ${backColor};\n`
		if (s.stroke.width > 0) css += `  -webkit-text-stroke: ${em(s.stroke.width * 2, s.size)} ${s.stroke.color};\n`
		if (ext) css += `  text-shadow:\n    ${ext};\n`
		css += `}\n\n`
	}
	css += `${sel} > span > span {\n  display: block;\n  position: relative;\n  padding: ${pad}em;\n  margin: -${pad}em;\n  background: var(--wa-fill);\n  background-size: var(--wa-w) 100%;\n  background-position: calc(${pad}em - var(--x)${shift}) 0;\n  -webkit-background-clip: text;\n  background-clip: text;\n  color: transparent;\n  -webkit-text-fill-color: transparent;\n}\n`

	const kf: Partial<Record<Anim, string>> = {
		wave: `@keyframes ${k}-wave {\n  0%, 100% { translate: 0 0; }\n  50% { translate: 0 -0.22em; }\n}`,
		jelly: `@keyframes ${k}-jelly {\n  0%, 100% { scale: 1 1; }\n  30% { scale: 1.18 0.82; }\n  60% { scale: 0.9 1.14; }\n}`,
		swing: `@keyframes ${k}-swing {\n  from { rotate: -9deg; }\n  to { rotate: 9deg; }\n}`,
		float: `@keyframes ${k}-float {\n  0%, 100% { translate: 0 0; }\n  50% { translate: 0 -0.18em; }\n}`,
		spin: `@keyframes ${k}-spin {\n  to { rotate: y 360deg; }\n}`,
		rainbow: `@keyframes ${k}-rainbow {\n  from { filter: ${drop || ''} hue-rotate(0deg); }\n  to { filter: ${drop || ''} hue-rotate(360deg); }\n}`,
		flow: `@keyframes ${k}-flow {\n  to { --wa-shift: 1; }\n}`,
	}
	if (kf[anim]) {
		css += `\n${kf[anim]}\n\n@media (prefers-reduced-motion: reduce) {\n  ${sel}, ${sel} * { animation: none !important; }\n}\n`
	}
	return css
}

/* ───────────────────────────── Geometry ───────────────────────────── */

export interface Letter {
	c: string
	style: string
}

const seg =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		: null
export const graphemes = (t: string) => (seg ? [...seg.segment(t)].map((x) => x.segment) : [...t])

const escAttr = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Work out each letter's transform from flat layout measurements (px). */
function layout(s: WAState, lefts: number[], widths: number[], W: number): Letter[] {
	const size = s.size
	const { curve, wave, freq, bulge, taper } = s.shape
	const tp = taper / 100
	const bg = bulge / 100
	const count = lefts.length

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
		return { c: '', style }
	})
}

const letterHTML = (l: Letter) => {
	const c = escAttr(l.c)
	return `<span data-c="${c}" style="${l.style}" aria-hidden="true"><span>${c}</span></span>`
}

/* ───────────────────────────── Render ───────────────────────────── */

let uid = 0

export interface Rendered {
	letters: Letter[]
	wEm: number
}

/**
 * Render WordArt into `host`. Letters are laid out flat first so their real
 * widths (with the web font) can be measured, then bent into shape. When
 * `fit` is set the result is scaled + centred to fill the host.
 */
export function render(host: HTMLElement, s: WAState, opts: { fit?: boolean; maxScale?: number } = {}): Rendered {
	const id = (host.dataset.waId ||= `wa-${++uid}`)
	const sel = `.${id}`
	const chars = graphemes(s.text || ' ')

	let style = host.querySelector<HTMLStyleElement>(':scope > style')
	let fit = host.querySelector<HTMLElement>(':scope > .wa-fit')
	if (!style || !fit) {
		host.innerHTML = `<style></style><div class="wa-fit"></div>`
		style = host.querySelector('style')!
		fit = host.querySelector('.wa-fit')!
	}
	style.textContent = cssFor(s, sel, 1, { kf: id })

	const root = document.createElement('span')
	root.className = id
	root.setAttribute('role', 'img')
	root.setAttribute('aria-label', s.text)
	root.innerHTML = chars.map((c) => letterHTML({ c, style: '--i:0;--x:0em' })).join('')
	fit.replaceChildren(root)

	const spans = [...root.children] as HTMLElement[]
	const lefts = spans.map((el) => el.offsetLeft)
	const widths = spans.map((el) => el.offsetWidth)
	const W = root.offsetWidth || 1
	const letters = layout(s, lefts, widths, W).map((l, i) => ({ ...l, c: chars[i] }))
	const wEm = W / s.size

	style.textContent = cssFor(s, sel, wEm, { kf: id })
	spans.forEach((el, i) => el.setAttribute('style', letters[i].style))

	if (opts.fit) fitTo(host, fit, root, s, opts.maxScale ?? 1)
	return { letters, wEm }
}

function fitTo(host: HTMLElement, fit: HTMLElement, root: HTMLElement, s: WAState, maxScale: number) {
	host.classList.add('wa-measuring')
	fit.style.transform = 'none'
	const fr = fit.getBoundingClientRect()
	let x0 = Infinity
	let y0 = Infinity
	let x1 = -Infinity
	let y1 = -Infinity
	for (const el of root.children) {
		const r = el.getBoundingClientRect()
		x0 = Math.min(x0, r.left)
		y0 = Math.min(y0, r.top)
		x1 = Math.max(x1, r.right)
		y1 = Math.max(y1, r.bottom)
	}
	host.classList.remove('wa-measuring')
	if (!Number.isFinite(x0)) return
	// Room for things that paint outside the letter boxes.
	const rad = (s.extrude.angle * Math.PI) / 180
	const ex = Math.cos(rad) * s.extrude.depth
	const ey = Math.sin(rad) * s.extrude.depth
	const sh = s.shadow.blur * 1.5
	const st = s.stroke.width * 2
	x0 += Math.min(0, ex, s.shadow.x - sh) - st
	x1 += Math.max(0, ex, s.shadow.x + sh) + st
	y0 += Math.min(0, ey, s.shadow.y - sh) - st
	y1 += Math.max(0, ey, s.shadow.y + sh) + st

	const hw = host.clientWidth
	const hh = host.clientHeight
	const pad = Math.min(hw, hh) * 0.08
	const w = x1 - x0
	const h = y1 - y0
	const scale = Math.min(maxScale, (hw - pad * 2) / w, (hh - pad * 2) / h)
	const cx = (x0 + x1) / 2 - fr.left
	const cy = (y0 + y1) / 2 - fr.top
	fit.style.transform = `translate(${hw / 2 - cx * scale}px, ${hh / 2 - cy * scale}px) scale(${scale})`
}

/** Standalone, copy-pasteable HTML + CSS for the last render. */
export function exportCode(s: WAState, r: Rendered): { html: string; css: string } {
	const css = cssFor(s, '.wordart', r.wEm, { imports: true })
	const html = `<span class="wordart" role="img" aria-label="${escAttr(s.text)}">${r.letters.map(letterHTML).join('')}</span>`
	return { html, css }
}

/* ───────────────────────────── Share ───────────────────────────── */

export const encodeState = (s: WAState) =>
	btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(s))))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')

export function decodeState(str: string): WAState | null {
	try {
		const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
		const json = new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))
		return merge(clone(DEFAULT_STATE), JSON.parse(json))
	} catch {
		return null
	}
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
