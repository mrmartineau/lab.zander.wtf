/**
 * Song data for the loop synth. Pure — no audio, no DOM — so the check in
 * `song.check.ts` can run it in Node.
 *
 * A pattern is one 32-bit mask per row: bit `n` set = row plays on step `n`.
 * Songs use the first 16 or 32 bits.
 */

export const STEP_OPTIONS = [16, 32] as const
export const MAX_STEPS = 32
export const SLOTS = ['A', 'B', 'C', 'D'] as const
export const MAX_CHAIN = 8
export const WAVES = ['triangle', 'sine', 'square', 'sawtooth'] as const
export type Wave = (typeof WAVES)[number]

/**
 * Top to bottom, as drawn. `midi` is the note number — melody notes are
 * C major pentatonic, so any mix sounds good; drums use General MIDI numbers.
 */
export const ROWS = [
	{ name: 'E5', midi: 76 },
	{ name: 'D5', midi: 74 },
	{ name: 'C5', midi: 72 },
	{ name: 'A4', midi: 69 },
	{ name: 'G4', midi: 67 },
	{ name: 'E4', midi: 64 },
	{ name: 'D4', midi: 62 },
	{ name: 'C4', midi: 60 },
	{ name: 'Hat', midi: 42, drum: 'hat' },
	{ name: 'Snare', midi: 38, drum: 'snare' },
	{ name: 'Kick', midi: 36, drum: 'kick' },
] as const

export const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

export type Song = {
	bpm: number
	wave: Wave
	/** SLOTS.length patterns × ROWS.length masks */
	patterns: number[][]
	/** Slot indexes, played in order, then looped */
	chain: number[]
	steps: (typeof STEP_OPTIONS)[number]
	/** Effect levels, 0–100 */
	delay: number
	reverb: number
}

const mask = (...steps: number[]) => steps.reduce((m, s) => (m | (1 << s)) >>> 0, 0)
const row = (name: string) => ROWS.findIndex((r) => r.name === name)

function pattern(notes: Record<string, number[]>) {
	const p = ROWS.map(() => 0)
	for (const [name, steps] of Object.entries(notes)) p[row(name)] = mask(...steps)
	return p
}

const beat = { Kick: [0, 6, 8], Snare: [4, 12], Hat: [0, 2, 4, 6, 8, 10, 12, 14] }

export const DEFAULT_SONG: Song = {
	bpm: 110,
	wave: 'triangle',
	patterns: [
		pattern({ ...beat, C4: [0], E4: [3], G4: [6], A4: [8], C5: [11], E5: [14] }),
		pattern({ ...beat, A4: [0], G4: [3], E4: [6, 8], D4: [11], C4: [14] }),
		ROWS.map(() => 0),
		ROWS.map(() => 0),
	],
	chain: [0, 0, 1, 0],
	steps: 16,
	delay: 20,
	reverb: 25,
}

export const isOn = (p: number[], r: number, step: number) => ((p[r] >>> step) & 1) === 1
/** `>>> 0` keeps step 31 positive, so masks stay valid JSON integers. */
export const toggle = (p: number[], r: number, step: number) => (p[r] = (p[r] ^ (1 << step)) >>> 0)

/** Global step counter → which chain entry and column is playing. */
export function position(step: number, chainLength: number, steps: number) {
	return { link: Math.floor(step / steps) % chainLength, col: step % steps }
}

/* ───────────────────────────── Share ───────────────────────────── */

export const encodeSong = (s: Song) =>
	btoa(JSON.stringify([s.bpm, s.wave, s.patterns, s.chain, s.steps, s.delay, s.reverb]))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')

const int = (v: unknown, min: number, max: number) =>
	Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** Parses a URL hash. Returns null for anything malformed. */
export function decodeSong(str: string): Song | null {
	if (!str) return null
	try {
		const [bpm, wave, patterns, chain, steps = 16, delay = 0, reverb = 0] = JSON.parse(
			atob(str.replace(/-/g, '+').replace(/_/g, '/')),
		)
		const ok =
			int(bpm, 60, 180) &&
			WAVES.includes(wave) &&
			Array.isArray(patterns) &&
			patterns.length === SLOTS.length &&
			patterns.every(
				(p: unknown) =>
					Array.isArray(p) && p.length === ROWS.length && p.every((m) => int(m, 0, 0xffffffff)),
			) &&
			Array.isArray(chain) &&
			chain.length >= 1 &&
			chain.length <= MAX_CHAIN &&
			chain.every((c) => int(c, 0, SLOTS.length - 1)) &&
			STEP_OPTIONS.includes(steps) &&
			int(delay, 0, 100) &&
			int(reverb, 0, 100)
		return ok ? { bpm, wave, patterns, chain, steps, delay, reverb } : null
	} catch {
		return null
	}
}
