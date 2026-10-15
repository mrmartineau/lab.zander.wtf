// The animation document and the keyframe rules. No DOM here, so
// doc.check.ts can run it in Node.

export const KINDS = ['rect', 'ellipse', 'line', 'path', 'text'] as const
export type Kind = (typeof KINDS)[number]

/** What a keyframe stores. Everything else about an element is the same on every frame. */
export interface Pose {
	x: number
	y: number
	rotate: number
	scale: number
	opacity: number
}
export const POSE_KEYS = ['x', 'y', 'rotate', 'scale', 'opacity'] as const

export type Point = [number, number]

export interface El {
	id: string
	kind: Kind
	/** Rect and ellipse size, centred on the pose. */
	w: number
	h: number
	/** Line and path points, relative to the pose. */
	points: Point[]
	closed: boolean
	text: string
	font: Font
	size: number
	bold: boolean
	fill: string
	stroke: string
	strokeWidth: number
	/** First and last frame it shows on (0-based, inclusive). */
	from: number
	to: number
	/** Frame → pose. The pose holds until the next key. */
	keys: Record<number, Pose>
}

export const FONTS = {
	sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
	serif: 'Georgia, "Times New Roman", serif',
	mono: 'ui-monospace, Menlo, Consolas, monospace',
	round: 'ui-rounded, "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif',
	hand: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
} as const
export type Font = keyof typeof FONTS

export const SIZES = {
	wide: [960, 540],
	square: [720, 720],
	tall: [540, 960],
	classic: [800, 600],
} as const
export type Size = keyof typeof SIZES

export interface Doc {
	size: Size
	bg: string
	fps: number
	frames: number
	loop: boolean
	/** Ease between keys instead of holding each until the next. */
	tween: boolean
	/** Back to front. */
	els: El[]
}

export const MAX_FRAMES = 600
export const MAX_FPS = 60

export const newDoc = (): Doc => ({ size: 'wide', bg: '#ffffff', fps: 12, frames: 24, loop: true, tween: false, els: [] })

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Key frames of an element, earliest first. */
export const keyFrames = (el: El) =>
	Object.keys(el.keys)
		.map(Number)
		.sort((a, b) => a - b)

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * The pose on a frame: the latest key at or before it. Before the first key,
 * the first key. With `tween`, frames between two keys ease from one to the next.
 */
export function poseAt(el: El, frame: number, tween = false): Pose {
	const frames = keyFrames(el)
	let i = frames.length - 1
	while (i > 0 && frames[i] > frame) i--
	const a = el.keys[frames[i]]
	const next = frames[i + 1]
	if (!tween || next === undefined || frames[i] > frame) return a
	const b = el.keys[next]
	const t = ease((frame - frames[i]) / (next - frames[i]))
	const lerp = (k: keyof Pose) => a[k] + (b[k] - a[k]) * t
	return { x: lerp('x'), y: lerp('y'), rotate: lerp('rotate'), scale: lerp('scale'), opacity: lerp('opacity') }
}

export const visibleAt = (el: El, frame: number) => frame >= el.from && frame <= el.to

/**
 * Changes the pose on one frame. That frame becomes a key, so the change carries
 * on through later frames up to the element's next key, and no further.
 */
export function setPose(el: El, frame: number, change: Partial<Pose>, tween = false) {
	el.keys[frame] = { ...poseAt(el, frame, tween), ...change }
}

/** Removes a key. The last key stays: an element always has a pose. */
export function removeKey(el: El, frame: number) {
	if (keyFrames(el).length > 1) delete el.keys[frame]
}

/** Moves a key to another frame. Returns false when that frame already has one. */
export function moveKey(el: El, from: number, to: number) {
	if (from === to) return true
	if (to in el.keys || !(from in el.keys)) return false
	el.keys[to] = el.keys[from]
	delete el.keys[from]
	return true
}

let seq = 0
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`

export function makeEl(kind: Kind, frame: number, frames: number, pose: Partial<Pose>, props: Partial<El> = {}): El {
	return {
		id: uid(),
		kind,
		w: 0,
		h: 0,
		points: [],
		closed: false,
		text: '',
		font: 'sans',
		size: 48,
		bold: false,
		fill: '#ff4d6d',
		stroke: '#1a1a1a',
		strokeWidth: 0,
		from: frame,
		to: frames - 1,
		keys: { [frame]: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, ...pose } },
		...props,
	}
}

/* ───────────── geometry ───────────── */

/** A smooth SVG path through the points (midpoint quadratics). */
export function pathD(points: Point[], closed: boolean) {
	if (points.length < 2) return ''
	const f = (n: number) => +n.toFixed(1)
	if (points.length === 2) {
		const [[ax, ay], [bx, by]] = points
		return `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}${closed ? 'Z' : ''}`
	}
	const mid = (a: Point, b: Point) => `${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`
	let d = `M${f(points[0][0])} ${f(points[0][1])}`
	for (let i = 1; i < points.length - 1; i++) {
		d += `Q${f(points[i][0])} ${f(points[i][1])} ${mid(points[i], points[i + 1])}`
	}
	const last = points[points.length - 1]
	return `${d}L${f(last[0])} ${f(last[1])}${closed ? 'Z' : ''}`
}

/** Drops points closer than `min` to the last kept one. */
export function thin(points: Point[], min = 3) {
	const out: Point[] = []
	for (const p of points) {
		const q = out[out.length - 1]
		if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= min) out.push(p)
	}
	const end = points[points.length - 1]
	if (end && out[out.length - 1] !== end) out.push(end)
	return out
}

/** Moves points so their bounding box centres on 0,0. Returns the old centre. */
export function centre(points: Point[]): { points: Point[]; cx: number; cy: number } {
	const xs = points.map((p) => p[0])
	const ys = points.map((p) => p[1])
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2
	const cy = (Math.min(...ys) + Math.max(...ys)) / 2
	return { points: points.map(([x, y]) => [x - cx, y - cy]), cx, cy }
}

/** Local box of an element before its pose, as [x, y, w, h]. Text is a rough guess; the editor measures it. */
export function localBox(el: El): [number, number, number, number] {
	if (el.kind === 'rect' || el.kind === 'ellipse') return [-el.w / 2, -el.h / 2, el.w, el.h]
	if (el.kind === 'text') {
		const lines = el.text.split('\n')
		const w = Math.max(...lines.map((l) => l.length)) * el.size * 0.55
		const h = lines.length * el.size * 1.2
		return [-w / 2, -h / 2, w, h]
	}
	const xs = el.points.map((p) => p[0])
	const ys = el.points.map((p) => p[1])
	const x = Math.min(...xs)
	const y = Math.min(...ys)
	return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]
}

/* ───────────── saving ───────────── */

const isColour = (v: unknown) => typeof v === 'string' && (v === 'none' || /^#[0-9a-f]{6}$/i.test(v))
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

function readPose(v: unknown): Pose | null {
	if (!v || typeof v !== 'object') return null
	const p = v as Pose
	return POSE_KEYS.every((k) => isNum(p[k])) ? { x: p.x, y: p.y, rotate: p.rotate, scale: p.scale, opacity: clamp(p.opacity, 0, 1) } : null
}

function readEl(v: unknown): El | null {
	if (!v || typeof v !== 'object') return null
	const e = v as El
	if (!KINDS.includes(e.kind) || !isColour(e.fill) || !isColour(e.stroke)) return null
	if (![e.w, e.h, e.size, e.strokeWidth, e.from, e.to].every(isNum)) return null
	if (!Array.isArray(e.points) || !e.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNum))) return null
	if (!(e.font in FONTS) || typeof e.text !== 'string') return null
	const keys: Record<number, Pose> = {}
	for (const [f, p] of Object.entries(e.keys ?? {})) {
		const pose = readPose(p)
		if (!pose || !Number.isInteger(+f) || +f < 0) return null
		keys[+f] = pose
	}
	if (!Object.keys(keys).length) return null
	return {
		id: typeof e.id === 'string' ? e.id : uid(),
		kind: e.kind,
		w: e.w,
		h: e.h,
		points: e.points,
		closed: Boolean(e.closed),
		text: e.text,
		font: e.font,
		size: e.size,
		bold: Boolean(e.bold),
		fill: e.fill,
		stroke: e.stroke,
		strokeWidth: e.strokeWidth,
		from: Math.max(0, Math.round(e.from)),
		to: Math.max(0, Math.round(e.to)),
		keys,
	}
}

/** Checks a parsed document. Returns null when anything is off. */
export function readDoc(v: unknown): Doc | null {
	if (!v || typeof v !== 'object') return null
	const d = v as Doc
	if (!(d.size in SIZES) || !isColour(d.bg) || d.bg === 'none') return null
	if (!Number.isInteger(d.fps) || d.fps < 1 || d.fps > MAX_FPS) return null
	if (!Number.isInteger(d.frames) || d.frames < 1 || d.frames > MAX_FRAMES) return null
	if (!Array.isArray(d.els)) return null
	const els = d.els.map(readEl)
	if (els.some((e) => !e)) return null
	return { size: d.size, bg: d.bg, fps: d.fps, frames: d.frames, loop: Boolean(d.loop), tween: Boolean(d.tween), els: els as El[] }
}

const toB64 = (bytes: Uint8Array) => {
	let s = ''
	for (const b of bytes) s += String.fromCharCode(b)
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const pipe = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) =>
	new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer())

/** A compact, URL-safe string for share links. */
export async function encodeDoc(doc: Doc) {
	return toB64(await pipe(new TextEncoder().encode(JSON.stringify(doc)), new CompressionStream('deflate-raw')))
}

export async function decodeDoc(s: string): Promise<Doc | null> {
	try {
		return readDoc(JSON.parse(new TextDecoder().decode(await pipe(fromB64(s), new DecompressionStream('deflate-raw')))))
	} catch {
		return null
	}
}
