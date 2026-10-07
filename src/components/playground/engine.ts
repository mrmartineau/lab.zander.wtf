/* Parameters, share links, presets and randomness for the playground.
   SPEC is the one source of truth: it drives the Tweakpane controls, the
   shader uniforms (`u_<key>`), the share-link validation and the dice. */

export const MODES = [
	{ id: 'blobs', label: 'Blobs', icon: 'ph-circles-three' },
	{ id: 'folds', label: 'Folds', icon: 'ph-waves' },
	{ id: 'conic', label: 'Conic', icon: 'ph-chart-pie-slice' },
	{ id: 'shards', label: 'Shards', icon: 'ph-lightning' },
	{ id: 'arcs', label: 'Arcs', icon: 'ph-rainbow' },
	{ id: 'swarm', label: 'Swarm', icon: 'ph-bird' },
] as const
export type Mode = (typeof MODES)[number]['id']

/** Modes whose shader reads the Light folder. */
export const LIT: Mode[] = ['blobs', 'folds']

export type Group = Mode | 'light' | 'colour' | 'finish' | 'motion' | 'canvas'

type Spec =
	| { v: number; min: number; max: number; step?: number; label: string; group: Group }
	| { v: boolean; label: string; group: Group }
	| { v: string; label: string; group: Group; options?: readonly string[] }

const MODE_IDS = MODES.map((m) => m.id)
const ASPECTS = ['1:1', '4:5', '3:4', '2:3', '9:16', '3:2', '16:9']

// Key order is folder order in the panel.
export const SPEC = {
	mode: { v: 'blobs' as Mode, label: 'Mode', group: 'canvas', options: MODE_IDS },

	blobCount: { v: 5, min: 1, max: 50, step: 1, label: 'Count', group: 'blobs' },
	blobSize: { v: 0.17, min: 0.02, max: 0.4, label: 'Size', group: 'blobs' },
	blobSpread: { v: 0.4, min: 0, max: 1, label: 'Spread', group: 'blobs' },
	blobSmooth: { v: 0.12, min: 0, max: 0.4, label: 'Melt', group: 'blobs' },
	rim: { v: -0.6, min: -1, max: 1, label: 'Rim', group: 'blobs' },
	gloss: { v: 0.15, min: 0, max: 1, label: 'Gloss', group: 'blobs' },

	foldScale: { v: 1.6, min: 0.3, max: 6, label: 'Scale', group: 'folds' },
	foldDepth: { v: 1, min: 0, max: 3, label: 'Depth', group: 'folds' },
	foldWarp: { v: 0.8, min: 0, max: 2, label: 'Warp', group: 'folds' },
	foldSharp: { v: 0.3, min: 0, max: 1, label: 'Crease', group: 'folds' },

	conicPoints: { v: 4, min: 1, max: 6, step: 1, label: 'Points', group: 'conic' },
	conicSpread: { v: 0.35, min: 0, max: 0.8, label: 'Spread', group: 'conic' },
	conicFalloff: { v: 2.5, min: 0.5, max: 8, label: 'Falloff', group: 'conic' },
	conicSoft: { v: 0.05, min: 0, max: 0.5, label: 'Seam blur', group: 'conic' },
	conicTwist: { v: 0, min: -6, max: 6, label: 'Twist', group: 'conic' },

	shardCount: { v: 7, min: 2, max: 24, step: 1, label: 'Spikes', group: 'shards' },
	shardLayers: { v: 4, min: 1, max: 5, step: 1, label: 'Layers', group: 'shards' },
	shardBlur: { v: 0.3, min: 0, max: 1, label: 'Blur', group: 'shards' },
	shardSpin: { v: 1.5, min: -8, max: 8, label: 'Spiral', group: 'shards' },
	shardSpread: { v: 0.35, min: 0, max: 0.8, label: 'Spread', group: 'shards' },

	arcY: { v: -0.7, min: -1.5, max: 0.5, label: 'Centre Y', group: 'arcs' },
	arcRadius: { v: 1.1, min: 0.2, max: 2, label: 'Radius', group: 'arcs' },
	arcBands: { v: 6, min: 1, max: 24, label: 'Bands', group: 'arcs' },
	arcBlur: { v: 0.6, min: 0, max: 1, label: 'Blur', group: 'arcs' },
	arcChroma: { v: 0.012, min: 0, max: 0.08, label: 'Chroma', group: 'arcs' },
	arcFade: { v: 0.8, min: 0, max: 1, label: 'Fade', group: 'arcs' },

	swarmBirds: { v: 220, min: 30, max: 400, step: 1, label: 'Birds', group: 'swarm' },
	swarmSize: { v: 0.32, min: 0.05, max: 0.5, label: 'Bird size', group: 'swarm' },
	swarmScale: { v: 0.9, min: 0.3, max: 4, label: 'Shape', group: 'swarm' },
	swarmWarp: { v: 0.9, min: 0, max: 2, label: 'Warp', group: 'swarm' },
	swarmThin: { v: 0.1, min: 0.01, max: 0.4, label: 'Edge', group: 'swarm' },
	swarmSpread: { v: 0.7, min: 0.1, max: 1, label: 'Spread', group: 'swarm' },
	swarmScatter: { v: 1, min: 0, max: 1, label: 'Scatter', group: 'swarm' },

	lightAngle: { v: 135, min: 0, max: 360, label: 'Angle', group: 'light' },
	lightHeight: { v: 35, min: 0, max: 90, label: 'Height', group: 'light' },
	soft: { v: 0.6, min: 0, max: 2, label: 'Softness', group: 'light' },
	ambient: { v: 0.2, min: 0, max: 1, label: 'Ambient', group: 'light' },

	c1: { v: '#5c5c5c', label: 'Colour 1', group: 'colour' },
	c2: { v: '#8d8d8d', label: 'Colour 2', group: 'colour' },
	c3: { v: '#3c3c3c', label: 'Colour 3', group: 'colour' },
	c4: { v: '#b5b5b5', label: 'Colour 4', group: 'colour' },
	bg: { v: '#eeeff1', label: 'Background', group: 'colour' },

	grain: { v: 0.08, min: 0, max: 0.6, label: 'Grain', group: 'finish' },
	grainSize: { v: 1, min: 0.5, max: 6, label: 'Grain size', group: 'finish' },
	dots: { v: false, label: 'Halftone', group: 'finish' },
	dotSize: { v: 8, min: 3, max: 40, label: 'Dot size', group: 'finish' },
	vignette: { v: 0, min: 0, max: 1, label: 'Vignette', group: 'finish' },
	exposure: { v: 0, min: -2, max: 2, label: 'Exposure', group: 'finish' },
	saturation: { v: 1, min: 0, max: 2, label: 'Saturation', group: 'finish' },

	animate: { v: false, label: 'Animate', group: 'motion' },
	speed: { v: 4, min: 0.5, max: 30, label: 'Speed', group: 'motion' },
	phase: { v: 0, min: 0, max: 100, label: 'Evolve', group: 'motion' },

	aspect: { v: '1:1', label: 'Aspect', group: 'canvas', options: ASPECTS },
	seed: { v: 7, min: 0, max: 999, step: 1, label: 'Seed', group: 'canvas' },
} satisfies Record<string, Spec>

export type Key = keyof typeof SPEC
export type Params = { [K in Key]: (typeof SPEC)[K]['v'] }

const ENTRIES = Object.entries(SPEC) as [Key, Spec][]
export const DEFAULTS = Object.fromEntries(ENTRIES.map(([k, s]) => [k, s.v])) as Params

export const keysOf = (group: Group) => ENTRIES.filter(([, s]) => s.group === group).map(([k]) => k)

/** Keys a favourite can apply on its own, so one piece's colours can go on another's shape. */
export const PARTS = {
	shape: (p: Params): Key[] => ['mode', 'seed', ...keysOf(p.mode), ...keysOf('light')],
	colour: (): Key[] => keysOf('colour'),
	finish: (): Key[] => keysOf('finish'),
}

/** Known keys only, numbers clamped, colours and lists checked. Share links and storage are untrusted. */
export function sanitise(raw: unknown): Params {
	const out: Record<string, unknown> = { ...DEFAULTS }
	if (!raw || typeof raw !== 'object') return out as Params
	for (const [k, s] of ENTRIES) {
		const v = (raw as Record<string, unknown>)[k]
		if (typeof v !== typeof s.v) continue
		if ('min' in s) {
			if (Number.isFinite(v)) out[k] = Math.min(s.max, Math.max(s.min, v as number))
		} else if ('options' in s && s.options) {
			if (s.options.includes(v as string)) out[k] = v
		} else if (typeof v === 'string') {
			if (/^#[0-9a-f]{6}$/i.test(v)) out[k] = v.toLowerCase()
		} else out[k] = v
	}
	return out as Params
}

/** Only the values that differ from the defaults, so links stay short. */
export function encode(p: Params): string {
	const diff: Record<string, unknown> = {}
	for (const [k, s] of ENTRIES) {
		const v = typeof p[k] === 'number' ? +(p[k] as number).toFixed(4) : p[k]
		if (v !== s.v) diff[k] = v
	}
	if (!Object.keys(diff).length) return ''
	return btoa(JSON.stringify(diff)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decode(str: string): Params | null {
	if (!str) return null
	try {
		return sanitise(JSON.parse(atob(str.replace(/-/g, '+').replace(/_/g, '/'))))
	} catch {
		return null
	}
}

/** [width, height] for a long edge of `long` pixels at the piece's aspect. */
export function dims(long: number, p: Params): [number, number] {
	const [a, b] = p.aspect.split(':').map(Number)
	return a >= b ? [long, Math.round((long * b) / a)] : [Math.round((long * a) / b), long]
}

/** Starting points, one per mode — after the moodboard this was built from. */
export const PRESETS: { name: string; params: Partial<Params> }[] = [
	{ name: 'Putty', params: {} },
	{
		name: 'Silk',
		params: {
			mode: 'folds',
			c1: '#000000', c2: '#2b2b2b', c3: '#8a8a8a', c4: '#f4f4f4',
			foldScale: 1.1, foldDepth: 1, foldWarp: 0.7, foldSharp: 0.15,
			lightAngle: 120, lightHeight: 30, soft: 0.3, ambient: 0.05, grain: 0.22,
		},
	},
	{
		name: 'Prism',
		params: {
			mode: 'conic', seed: 3,
			c1: '#1c1c1c', c2: '#8a8a8a', c3: '#f7f7f7', c4: '#4a4a4a',
			grain: 0.08,
		},
	},
	{
		name: 'Ember',
		params: {
			mode: 'shards', aspect: '16:9', seed: 12,
			c1: '#0a0303', c2: '#a23a12', c3: '#f2a16a', c4: '#f8e6c8', bg: '#0a0303',
			shardCount: 8, shardLayers: 5, shardBlur: 0.35, shardSpin: 0.6, shardSpread: 0.5, grain: 0.06,
		},
	},
	{
		name: 'Horizon',
		params: {
			mode: 'arcs',
			c1: '#18e3c0', c2: '#0a0b3a', c3: '#ef1c25', c4: '#f4f0ff', bg: '#ff1460',
			arcY: -0.75, arcBands: 7, arcBlur: 0.55, arcChroma: 0.015, arcFade: 0.85, grain: 0.06,
		},
	},
	{
		name: 'Murmuration',
		params: {
			mode: 'swarm', aspect: '3:2', seed: 21,
			c1: '#121212', c2: '#efe3d2', c3: '#6b7078', c4: '#121212', bg: '#c9d0d8',
			grain: 0.1,
		},
	},
]

/** c1–c4 then background. */
const PALETTES = [
	['#ff2a1a', '#14b0f5', '#f7fbff', '#2c4a1e', '#101010'],
	['#0a0303', '#a23a12', '#f2a16a', '#f8e6c8', '#0a0303'],
	['#18e3c0', '#0a0b3a', '#ef1c25', '#f4f0ff', '#ff1460'],
	['#000000', '#2b2b2b', '#8a8a8a', '#f4f4f4', '#e9e9e9'],
	['#1b1464', '#6a4cff', '#ff9ad5', '#fff1c9', '#0c0a24'],
	['#05322e', '#0f8b6d', '#c8f169', '#f5f5dc', '#021412'],
	['#2a0a12', '#d7263d', '#f46036', '#ffd8a8', '#1a0509'],
	['#0b132b', '#3a86ff', '#8ecae6', '#ffffff', '#e6eef7'],
	['#3d2c8d', '#916bbf', '#c996cc', '#ffe5ec', '#1c0f45'],
	['#ff006e', '#fb5607', '#ffbe0b', '#3a86ff', '#120c1f'],
	['#5c5c5c', '#8d8d8d', '#3c3c3c', '#b5b5b5', '#eeeff1'],
]

/** New seed, palette, light and shape values for the current mode. Finish and canvas stay. */
export function randomise(p: Params): Partial<Params> {
	const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)]
	const next: Record<string, unknown> = {
		seed: Math.floor(Math.random() * 1000),
		c1: pal[0], c2: pal[1], c3: pal[2], c4: pal[3], bg: pal[4],
	}
	for (const k of [...keysOf(p.mode), ...keysOf('light')]) {
		const s = SPEC[k] as Spec
		if (!('min' in s)) continue
		const v = s.min + Math.random() * (s.max - s.min)
		next[k] = s.step ? Math.round(v / s.step) * s.step : +v.toFixed(3)
	}
	return next as Partial<Params>
}
