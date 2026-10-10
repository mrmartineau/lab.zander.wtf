/**
 * Pantry shelf planner: the room, shelf types and levels, and the maths that
 * turns them into boards. No DOM or Three.js here so it stays easy to check.
 *
 * Coordinates are in cm. x runs left to right along the back wall (0 = left
 * wall), z runs from the back wall (0) towards the doors, y is height.
 */

/** Shelf depth sizes, smallest to largest. */
export type TypeKey = 'sm' | 'md' | 'lg' | 'xl'
export type WallKey = 'L' | 'B' | 'R' | 'D'

export interface Room {
	/** Back wall width. */
	w: number
	/** Left wall depth, back wall to the front of the opening. */
	dl: number
	/** Right wall depth, back wall to the front of the opening. */
	dr: number
	/** Left return: width across the front, depth front to back. */
	ret: number
	retD: number
	/** Right return: width across the front, depth front to back. */
	retR: number
	retRD: number
	door: number
	h: number
	/** Extra clearance taken off each side shelf after any return. */
	setL: number
	set: number
	/** Board thickness. */
	th: number
	/** Lowest height an over-door shelf is allowed. */
	doorMin: number
	/** Light switch height, centred between the doors. */
	sw: number
}

export interface Level {
	/** Stable key so the UI can follow a level as it's re-sorted. */
	id?: number
	/** Height to the top of the shelf. */
	y: number
	L: TypeKey | ''
	B: TypeKey | ''
	R: TypeKey | ''
	D: TypeKey | ''
}

export type Depths = Record<TypeKey, number>

export interface Plan {
	room: Room
	depths: Depths
	levels: Level[]
}

export interface Board {
	/** Index into the sorted levels. */
	i: number
	y: number
	wall: 'Left' | 'Back' | 'Right' | 'Over door'
	t: TypeKey
	len: number
	d: number
	x0: number
	x1: number
	z0: number
	z1: number
	door?: boolean
}

export const TYPES: Record<TypeKey, { name: string; color: string }> = {
	sm: { name: 'SM', color: '--color-teal-500' },
	md: { name: 'MD', color: '--color-sky-500' },
	lg: { name: 'LG', color: '--color-violet-500' },
	xl: { name: 'XL', color: '--color-orange-500' },
}
export const TYPE_KEYS = Object.keys(TYPES) as TypeKey[]

export const WALLS: [WallKey, string][] = [
	['L', 'Left'],
	['B', 'Back'],
	['R', 'Right'],
	['D', 'Over door'],
]

export const ROOM_FIELDS: [keyof Room, string, [number, number]][] = [
	['w', 'Width (back wall)', [40, 500]],
	['dl', 'Left wall depth', [20, 400]],
	['dr', 'Right wall depth', [20, 400]],
	['ret', 'Left return width', [0, 100]],
	['retD', 'Left return depth', [0, 60]],
	['retR', 'Right return width', [0, 100]],
	['retRD', 'Right return depth', [0, 60]],
	['h', 'Ceiling height', [120, 400]],
	['door', 'Door height', [100, 350]],
	['sw', 'Light switch height', [50, 400]],
	['doorMin', 'Over-door min height', [100, 400]],
	['setL', 'Left shelf setback', [0, 50]],
	['set', 'Right shelf setback', [0, 50]],
	['th', 'Board thickness', [0.5, 5]],
]

export const DEFAULT_ROOM: Room = {
	w: 146,
	dl: 93,
	dr: 103,
	ret: 14,
	retD: 10,
	retR: 0,
	retRD: 10,
	door: 211.5,
	h: 262,
	setL: 0,
	set: 3,
	th: 1.8,
	doorMin: 230,
	sw: 220,
}

export const DEFAULT_DEPTHS: Depths = { sm: 17, md: 25, lg: 30, xl: 35 }

export const DEFAULT_LEVELS: Level[] = [
	{ y: 12, L: 'sm', B: 'xl', R: 'lg', D: '' },
	{ y: 52, L: 'sm', B: 'xl', R: 'lg', D: '' },
	{ y: 88, L: 'sm', B: 'lg', R: 'lg', D: '' },
	{ y: 124, L: 'sm', B: 'lg', R: 'lg', D: '' },
	{ y: 160, L: 'sm', B: 'lg', R: 'lg', D: '' },
	{ y: 196, L: 'sm', B: 'lg', R: 'sm', D: '' },
	{ y: 238, L: 'sm', B: 'lg', R: 'lg', D: 'lg' },
]

export const defaultPlan = (): Plan => normalise(null)

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** One decimal place, no trailing ".0". */
export const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '')

export const clampY = (room: Room, v: number) => Math.min(room.h - 10, Math.max(2, Math.round(v * 2) / 2))

export const sortLevels = (levels: Level[]) => [...levels].sort((a, b) => a.y - b.y)

export const depthOf = (depths: Depths, t: TypeKey | '') => (t ? depths[t] : 0)

/** Side shelf lengths: wall depth, minus the return depth if there is one, minus the setback. */
export const leftLength = (r: Room) => Math.max(5, r.dl - (r.ret > 0 ? r.retD : 0) - r.setL)
export const rightLength = (r: Room) => Math.max(5, r.dr - (r.retR > 0 ? r.retRD : 0) - r.set)

/** The door opening sits between the two returns on a line from the left wall's front to the right's. */
export const openWidth = (r: Room) => Math.max(1, r.w - r.ret - r.retR)
export const frontZ = (r: Room, x: number) => r.dl + ((x - r.ret) * (r.dr - r.dl)) / openWidth(r)
export const frontSlope = (r: Room) => Math.sqrt(1 + ((r.dr - r.dl) / openWidth(r)) ** 2)
export const frontAngle = (r: Room) => -Math.atan2(r.dr - r.dl, openWidth(r))

/** Clear height above a level: to the underside of the next board, or the ceiling. */
export function gapAbove(plan: Plan, i: number) {
	const lv = sortLevels(plan.levels)
	const top = i < lv.length - 1 ? lv[i + 1].y - plan.room.th : plan.room.h
	return top - lv[i].y
}

/** Every board in the plan. Back boards fit between the side boards on the same level. */
export function boards(plan: Plan): Board[] {
	const { room: r, depths } = plan
	const out: Board[] = []
	const lL = leftLength(r)
	const rL = rightLength(r)
	sortLevels(plan.levels).forEach((l, i) => {
		const lD = depthOf(depths, l.L)
		const rD = depthOf(depths, l.R)
		if (l.L) out.push({ i, y: l.y, wall: 'Left', t: l.L, len: lL, d: lD, x0: 0, x1: lD, z0: 0, z1: lL })
		if (l.R) out.push({ i, y: l.y, wall: 'Right', t: l.R, len: rL, d: rD, x0: r.w - rD, x1: r.w, z0: 0, z1: rL })
		if (l.B) {
			const x0 = lD
			const x1 = r.w - rD
			const d = depthOf(depths, l.B)
			out.push({ i, y: l.y, wall: 'Back', t: l.B, len: x1 - x0, d, x0, x1, z0: 0, z1: d })
		}
		if (l.D && l.y >= r.doorMin) {
			const x0 = Math.max(r.ret, lD)
			const x1 = Math.min(r.w - r.retR, r.w - rD)
			const d = depthOf(depths, l.D)
			out.push({ i, y: l.y, wall: 'Over door', t: l.D, len: (x1 - x0) * frontSlope(r), d, x0, x1, z0: 0, z1: 0, door: true })
		}
	})
	return out
}

/** Narrowest walkway and shallowest standing depth below head height. */
export function clearances(plan: Plan) {
	let walk = plan.room.w
	let depth = plan.room.dl
	for (const l of plan.levels) {
		if (l.y >= 150) continue
		walk = Math.min(walk, plan.room.w - depthOf(plan.depths, l.L) - depthOf(plan.depths, l.R))
		depth = Math.min(depth, plan.room.dl - depthOf(plan.depths, l.B))
	}
	return { walk, depth }
}

function sideNote(side: string, d: number, rw: number, rd: number, sb: number, len: number) {
	const parts: string[] = []
	if (rw > 0 && rd > 0) parts.push(`the ${fmt(rw)} × ${fmt(rd)}cm return`)
	if (sb > 0) parts.push(`a ${fmt(sb)}cm setback`)
	return parts.length
		? `${side} wall shelves are ${fmt(len)}cm long: ${fmt(d)}cm wall minus ${parts.join(' and ')}.`
		: `${side} wall shelves run the full ${fmt(d)}cm.`
}

export function notes(r: Room) {
	return [
		sideNote('Left', r.dl, r.ret, r.retD, r.setL, leftLength(r)),
		sideNote('Right', r.dr, r.retR, r.retRD, r.set, rightLength(r)),
		`The over-door shelf follows the front wall (${fmt(r.dl)}cm on the left, ${fmt(r.dr)}cm on the right)${r.dl !== r.dr ? ", so its ends aren't square" : ''}. Light switch at ${fmt(r.sw)}cm, centred between the doors.`,
		'Measure the back wall at a few heights before cutting. Walls are rarely square.',
	]
}

/**
 * Plans saved before depths were sized used named types. Each maps to the size
 * that kept its depth (cookbooks were 30cm, so they become LG, not MD).
 */
const LEGACY_TYPE: Record<string, TypeKey> = { g: 'sm', p: 'lg', s: 'xl', b: 'lg' }
const LEGACY_DEPTH: Record<string, TypeKey> = { g: 'sm', p: 'lg', s: 'xl' }

/** Fill gaps from older saved data with defaults so new fields never come back undefined. */
export function normalise(p: Partial<Plan> | null | undefined): Plan {
	const room = { ...DEFAULT_ROOM }
	for (const k of Object.keys(DEFAULT_ROOM) as (keyof Room)[]) {
		const v = p?.room?.[k]
		if (typeof v === 'number' && Number.isFinite(v)) room[k] = v
	}
	const depths = { ...DEFAULT_DEPTHS }
	const oldDepths = (p?.depths ?? {}) as Record<string, unknown>
	for (const [from, to] of Object.entries(LEGACY_DEPTH)) {
		const v = oldDepths[from]
		if (typeof v === 'number' && v > 0) depths[to] = v
	}
	for (const t of TYPE_KEYS) {
		const v = oldDepths[t]
		if (typeof v === 'number' && v > 0) depths[t] = v
	}
	const levels = Array.isArray(p?.levels) && p.levels.length ? clone(p.levels) : clone(DEFAULT_LEVELS)
	levels.forEach((l, i) => {
		if (typeof l.id !== 'number') l.id = Date.now() + i
		for (const [k] of WALLS) {
			const v = l[k] as string
			l[k] = v in TYPES ? (v as TypeKey) : (LEGACY_TYPE[v] ?? '')
		}
	})
	return { room, depths, levels: sortLevels(levels) }
}

/* Browser storage. Every call is wrapped: private windows and blocked storage throw. */
const CURRENT_KEY = 'pantry-planner:current'
const SAVED_KEY = 'pantry-planner:saved'

export interface SavedPlan extends Plan {
	at: number
}

function read<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as T) : null
	} catch {
		return null
	}
}
function write(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value))
		return true
	} catch {
		return false
	}
}

export const loadCurrent = () => normalise(read<Plan>(CURRENT_KEY))
export const saveCurrent = (p: Plan) => write(CURRENT_KEY, p)
export const loadSaved = () => read<Record<string, SavedPlan>>(SAVED_KEY) ?? {}
export const writeSaved = (all: Record<string, SavedPlan>) => write(SAVED_KEY, all)
