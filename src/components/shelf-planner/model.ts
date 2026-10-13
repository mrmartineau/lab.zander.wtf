/**
 * Shelf planner: the room, shelf types and levels, and the maths that
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
	['doorMin', 'Over-door min height', [100, 400]],
	['setL', 'Left shelf setback', [0, 50]],
	['set', 'Right shelf setback', [0, 50]],
	['th', 'Board thickness', [0.3, 10]],
]

export const DEFAULT_ROOM: Room = {
	w: 146,
	dl: 103,
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
}

export const DEFAULT_DEPTHS: Depths = { sm: 17, md: 25, lg: 30, xl: 35 }

export const DEFAULT_LEVELS: Level[] = [
	{ y: 12, L: 'sm', B: 'xl', R: 'lg', D: '' },
	{ y: 52, L: 'sm', B: 'xl', R: 'lg', D: '' },
	{ y: 88, L: 'sm', B: 'lg', R: 'lg', D: '' },
	{ y: 124, L: 'sm', B: 'lg', R: 'lg', D: '' },
	{ y: 160, L: 'sm', B: 'lg', R: 'lg', D: '' },
	{ y: 196, L: 'sm', B: 'lg', R: 'sm', D: '' },
	{ y: 238, L: 'sm', B: 'lg', R: 'lg', D: '' },
]

export const defaultPlan = (): Plan => normalise(null)

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** One decimal place, no trailing ".0". */
export const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '')

export const clampY = (room: Room, v: number) => Math.min(room.h - 10, Math.max(2, Math.round(v * 2) / 2))

export const sortLevels = (levels: Level[]) => [...levels].sort((a, b) => a.y - b.y)

export const depthOf = (depths: Depths, t: TypeKey | '') => (t ? depths[t] : 0)

/**
 * Side shelf lengths: wall depth, minus the return depth if there is one, minus the setback.
 * Not floored: zero or less means the shelf doesn't fit, which boards() skips and notes() flags.
 */
export const leftLength = (r: Room) => r.dl - (r.ret > 0 ? r.retD : 0) - r.setL
export const rightLength = (r: Room) => r.dr - (r.retR > 0 ? r.retRD : 0) - r.set

/**
 * The door opening sits between the two returns on a line from the left wall's front to the right's.
 * The room editor keeps the returns at least 10cm short of the width, so the floor here is only a guard.
 */
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
		// A board that doesn't fit (zero or negative length) is left out rather than drawn inside out.
		if (l.L && lL > 0) out.push({ i, y: l.y, wall: 'Left', t: l.L, len: lL, d: lD, x0: 0, x1: lD, z0: 0, z1: lL })
		if (l.R && rL > 0) out.push({ i, y: l.y, wall: 'Right', t: l.R, len: rL, d: rD, x0: r.w - rD, x1: r.w, z0: 0, z1: rL })
		if (l.B && r.w - lD - rD > 0) {
			const x0 = lD
			const x1 = r.w - rD
			const d = depthOf(depths, l.B)
			out.push({ i, y: l.y, wall: 'Back', t: l.B, len: x1 - x0, d, x0, x1, z0: 0, z1: d })
		}
		if (l.D && l.y >= r.doorMin) {
			const x0 = Math.max(r.ret, lD)
			const x1 = Math.min(r.w - r.retR, r.w - rD)
			const d = depthOf(depths, l.D)
			if (x1 - x0 > 0) out.push({ i, y: l.y, wall: 'Over door', t: l.D, len: (x1 - x0) * frontSlope(r), d, x0, x1, z0: 0, z1: 0, door: true })
		}
	})
	return out
}

/** Shelves at or above this height (cm) are over head height, so they don't block the floor. */
export const HEAD = 150

/**
 * Narrowest walkway between the side shelves and shallowest standing depth in front of the back
 * shelf, below head height. Also says where each one is tightest, so the 3D view can show it.
 * `walkLevel` and `depthLevel` index the sorted levels, like Board.i; -1 means no shelf limits it.
 */
export function clearances(plan: Plan) {
	const r = plan.room
	// The shallower side wall is the tighter one to stand in.
	const front = Math.min(r.dl, r.dr)
	const out = { walk: r.w, walkX: [0, r.w], walkLevel: -1, depth: front, depthZ: 0, depthLevel: -1, front }
	sortLevels(plan.levels).forEach((l, i) => {
		if (l.y >= HEAD) return
		const lD = depthOf(plan.depths, l.L)
		const rD = depthOf(plan.depths, l.R)
		if (r.w - lD - rD < out.walk) Object.assign(out, { walk: r.w - lD - rD, walkX: [lD, r.w - rD], walkLevel: i })
		const bD = depthOf(plan.depths, l.B)
		if (front - bD < out.depth) Object.assign(out, { depth: front - bD, depthZ: bD, depthLevel: i })
	})
	return out
}

/** Battens are sold in this length (cm) at most timber yards. */
export const STOCK = 240
/** Saw cut (cm) lost between two pieces cut from one length. */
const KERF = 0.3
/** Brackets go at most this far apart (cm) for shelves loaded with jars and tins, and this far in from each end. */
export const BRACKET_GAP = 50
export const BRACKET_END = 10

export const bracketsFor = (len: number) => Math.max(2, Math.ceil((len - 2 * BRACKET_END) / BRACKET_GAP) + 1)

/** How many stock lengths the pieces cut from, packed first-fit decreasing. A piece longer than one length is joined. */
export function stockLengths(pieces: number[], stock = STOCK) {
	const parts = pieces.flatMap((p) => [...Array<number>(Math.floor(p / stock)).fill(stock), ...(p % stock > 0 ? [p % stock] : [])])
	const left: number[] = []
	for (const p of parts.sort((a, b) => b - a)) {
		const i = left.findIndex((r) => r >= p)
		if (i >= 0) left[i] -= p + KERF
		else left.push(stock - p - KERF)
	}
	return left.length
}

/**
 * Batten pieces (cm) for one board, or null when a batten can't hold it. A batten needs a wall on at
 * least two edges: side shelves have their side wall and the back wall, a back or over-door shelf
 * only when it runs wall to wall (then it gets a batten at each end too). A back shelf between two
 * side shelves has bare ends, so it needs brackets.
 */
export function battenPieces(plan: Plan, b: Board): number[] | null {
	const r = plan.room
	if (b.wall === 'Left' || b.wall === 'Right') return [b.len, b.d]
	if (b.wall === 'Back') return b.x0 <= 0 && b.x1 >= r.w ? [b.len, b.d, b.d] : null
	return b.x0 <= r.ret && b.x1 >= r.w - r.retR ? [b.len] : null
}

/**
 * The ways to hold the shelves up. Battens go under every board edge that meets a wall; brackets go
 * under each board. "Mix" uses battens where they hold and brackets for the rest.
 */
export function fixings(plan: Plan) {
	const all = boards(plan)
	const pieces = all.map((b) => battenPieces(plan, b))
	const battens = pieces.flatMap((p) => p ?? [])
	return {
		battens,
		battenRun: battens.reduce((a, b) => a + b, 0),
		stock: stockLengths(battens),
		/** Brackets if every shelf gets them. */
		brackets: all.reduce((a, b) => a + bracketsFor(b.len), 0),
		/** Brackets for only the shelves a batten can't hold. */
		mixBrackets: all.reduce((a, b, i) => a + (pieces[i] ? 0 : bracketsFor(b.len)), 0),
		/** Battens alone work only when none of the shelves need brackets. */
		battensOnly: all.length > 0 && pieces.every(Boolean),
	}
}

/** Identical boards (same depth and length to 1mm) grouped, narrowest first: "5 × 14cm × 96cm". */
export function sizeGroups(bs: Board[]) {
	const groups = new Map<string, { n: number; d: number; len: number }>()
	for (const b of bs) {
		const key = `${fmt(b.d)}x${fmt(b.len)}`
		const g = groups.get(key)
		if (g) g.n++
		else groups.set(key, { n: 1, d: Number(fmt(b.d)), len: Number(fmt(b.len)) })
	}
	return [...groups.values()].sort((a, b) => a.d - b.d || b.len - a.len)
}

/** Boards grouped by width (depth), narrowest first: count, total run (cm) and stock lengths to buy. */
export function widthTotals(bs: Board[]) {
	return [...new Set(bs.map((b) => b.d))]
		.sort((a, b) => a - b)
		.map((d) => {
			const lens = bs.filter((b) => b.d === d).map((b) => b.len)
			return { d, count: lens.length, run: lens.reduce((a, b) => a + b, 0), stock: stockLengths(lens) }
		})
}

/** Battens longer than one stock length have to be joined from two. Empty when none are. */
export const joinNote = (pieces: number[]) =>
	pieces.some((p) => p > STOCK) ? ` Pieces over ${fmt(STOCK)}cm are joined from two lengths.` : ''

/** "2 × 85, 4 × 40" — repeated lengths grouped, longest first. */
export function groupLengths(pieces: number[]) {
	const counts = new Map<string, number>()
	for (const p of [...pieces].sort((a, b) => b - a)) counts.set(fmt(p), (counts.get(fmt(p)) ?? 0) + 1)
	return [...counts].map(([len, n]) => `${n} × ${len}cm`).join(', ')
}

function sideNote(side: string, d: number, rw: number, rd: number, sb: number, len: number) {
	const parts: string[] = []
	if (rw > 0 && rd > 0) parts.push(`the ${fmt(rw)} × ${fmt(rd)}cm return`)
	if (sb > 0) parts.push(`a ${fmt(sb)}cm setback`)
	if (len <= 0)
		return `${side} wall shelves don't fit: ${fmt(d)}cm wall minus ${parts.join(' and ')} leaves nothing, so they're left out. Check the return and setback.`
	return parts.length
		? `${side} wall shelves are ${fmt(len)}cm long: ${fmt(d)}cm wall minus ${parts.join(' and ')}.`
		: `${side} wall shelves run the full ${fmt(d)}cm.`
}

export function notes(r: Room) {
	return [
		sideNote('Left', r.dl, r.ret, r.retD, r.setL, leftLength(r)),
		sideNote('Right', r.dr, r.retR, r.retRD, r.set, rightLength(r)),
		`The over-door shelf follows the front wall (${fmt(r.dl)}cm on the left, ${fmt(r.dr)}cm on the right)${r.dl !== r.dr ? ", so its ends aren't square" : ''}.`,
		'Measure the back wall at a few heights before cutting. Walls are rarely square.',
	]
}

/**
 * Plans saved before depths were sized used named types. Each maps to the size
 * that kept its depth (cookbooks were 30cm, so they become LG, not MD).
 * Plates and cookbooks both become LG; plates' depth wins when both were used.
 */
const LEGACY_TYPE: Record<string, TypeKey> = { g: 'sm', p: 'lg', s: 'xl', b: 'lg' }
const isSize = (v: unknown): v is TypeKey => typeof v === 'string' && Object.prototype.hasOwnProperty.call(TYPES, v)

/** Fill gaps from older saved data with defaults so new fields never come back undefined. */
export function normalise(p: Partial<Plan> | null | undefined): Plan {
	const room = { ...DEFAULT_ROOM }
	for (const k of Object.keys(DEFAULT_ROOM) as (keyof Room)[]) {
		const v = p?.room?.[k]
		if (typeof v === 'number' && Number.isFinite(v)) room[k] = v
	}
	// Stored and shared rooms get the same limits as the room editor, so no figure can overflow.
	for (const [k, , [min, max]] of ROOM_FIELDS) room[k] = Math.min(max, Math.max(min, room[k]))
	room.ret = Math.min(room.ret, Math.max(0, room.w - room.retR - 10))
	room.retR = Math.min(room.retR, Math.max(0, room.w - room.ret - 10))
	const depths = { ...DEFAULT_DEPTHS }
	const oldDepths = (p?.depths ?? {}) as Record<string, unknown>
	// Share links are untrusted: keep only levels that are objects with a usable height.
	const rawLevels = (Array.isArray(p?.levels) ? p.levels : clone(DEFAULT_LEVELS)).filter(
		(l): l is Level => !!l && typeof l === 'object' && typeof l.y === 'number' && Number.isFinite(l.y),
	)
	const used = new Set(rawLevels.flatMap((l) => WALLS.map(([k]) => l[k] as string)))
	const legacyDepth: [string, TypeKey][] = [
		['g', 'sm'],
		['s', 'xl'],
		// Cookbooks only set LG's depth when the plan had no plate shelves.
		...((used.has('b') && !used.has('p') ? [['b', 'lg']] : [['p', 'lg']]) as [string, TypeKey][]),
	]
	for (const [from, to] of legacyDepth) {
		const v = oldDepths[from]
		if (typeof v === 'number' && v > 0) depths[to] = v
	}
	for (const t of TYPE_KEYS) {
		const v = oldDepths[t]
		if (typeof v === 'number' && v > 0) depths[t] = v
	}
	for (const t of TYPE_KEYS) depths[t] = Math.min(60, Math.max(5, depths[t]))
	// Every level gets its own id; a missing or repeated one is replaced with the next unused number.
	const levels = clone(rawLevels)
	const ids = new Set<number>()
	let nextId = Date.now()
	levels.forEach((l) => {
		l.y = clampY(room, l.y)
		if (typeof l.id !== 'number' || !Number.isFinite(l.id) || ids.has(l.id)) {
			while (ids.has(nextId)) nextId++
			l.id = nextId++
		}
		ids.add(l.id)
		for (const [k] of WALLS) {
			const v = l[k] as string
			l[k] = isSize(v) ? v : Object.prototype.hasOwnProperty.call(LEGACY_TYPE, v) ? LEGACY_TYPE[v] : ''
		}
	})
	return { room, depths, levels: sortLevels(levels) }
}

/**
 * Share links carry the whole plan in the URL path (`/shelf-planner/p/CODE`), so nothing goes to a
 * server. Chat apps like WhatsApp cut a link short at `=` and inside a `#` fragment, but a path of
 * letters, digits, `-` and `_` stays whole. The plan is a short positional array (room figures in
 * `Object.keys(DEFAULT_ROOM)` order, so only ever add new room fields at the end), UTF-8 so any
 * name survives, then base64url.
 */
const SHARE_TYPES = ['', ...TYPE_KEYS]

export function encodeShare(name: string, p: Plan) {
	const json = JSON.stringify([
		name,
		Object.keys(DEFAULT_ROOM).map((k) => p.room[k as keyof Room]),
		TYPE_KEYS.map((t) => p.depths[t]),
		p.levels.map((l) => [l.y, ...(['L', 'B', 'R', 'D'] as const).map((w) => SHARE_TYPES.indexOf(l[w]))]),
	])
	return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
}

/**
 * The share code in a URL: `/p/CODE` in the path, or the older `?plan=CODE`, `#plan-CODE` and
 * `#plan=CODE` forms, which are still read. Pass `location.pathname + location.search + location.hash`.
 */
export const shareCodeFrom = (url: string) => /\/p\/([\w-]+)|[?#&]plan[-=]([\w-]+)/.exec(url)?.slice(1).find(Boolean) ?? ''

export function decodeShare(code: string): { name: string; plan: Plan } | null {
	try {
		const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
		const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
		// The long form from older links: { n: name, p: plan }.
		if (!Array.isArray(j)) {
			const { n, p } = j
			if (!p || typeof p !== 'object' || !Array.isArray(p.levels)) return null
			return { name: typeof n === 'string' ? n.trim().slice(0, 60) : '', plan: normalise(p) }
		}
		const [n, r, d, l] = j
		if (!Array.isArray(l)) return null
		const levels = l.map((x) =>
			Array.isArray(x) ? { y: x[0], L: SHARE_TYPES[x[1]], B: SHARE_TYPES[x[2]], R: SHARE_TYPES[x[3]], D: SHARE_TYPES[x[4]] } : null,
		)
		const plan = normalise({
			room: Object.fromEntries(Object.keys(DEFAULT_ROOM).map((k, i) => [k, r?.[i]])),
			depths: Object.fromEntries(TYPE_KEYS.map((t, i) => [t, d?.[i]])),
			levels,
		} as unknown as Partial<Plan>)
		return { name: typeof n === 'string' ? n.trim().slice(0, 60) : '', plan }
	} catch {
		return null
	}
}

/* Browser storage. Every call is wrapped: private windows and blocked storage throw. */
const CURRENT_KEY = 'shelf-planner:current'
const SAVED_KEY = 'shelf-planner:saved'

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

// ponytail: plans kept before the rename to shelf planner. Delete once nobody has them.
export const loadCurrent = () => normalise(read<Plan>(CURRENT_KEY) ?? read<Plan>('pantry-planner:current'))
export const saveCurrent = (p: Plan) => write(CURRENT_KEY, p)
export const loadSaved = () =>
	read<Record<string, SavedPlan>>(SAVED_KEY) ?? read<Record<string, SavedPlan>>('pantry-planner:saved') ?? {}
export const writeSaved = (all: Record<string, SavedPlan>) => write(SAVED_KEY, all)
