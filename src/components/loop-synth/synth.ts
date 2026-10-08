/**
 * Web Audio voices, effects and a lookahead scheduler. Everything is
 * synthesised — no samples. Scheduling pattern:
 * https://web.dev/articles/audio-scheduling
 *
 * The same graph runs live (AudioContext) and for WAV export
 * (OfflineAudioContext).
 */
import { ROWS, freq, isOn, position, type Song } from './song'

const LOOKAHEAD = 0.1 // seconds of audio scheduled ahead
const TICK = 25 // ms between scheduler runs
const TAIL = 2.5 // seconds rendered after the last step, for reverb and delay

type Rig = {
	c: BaseAudioContext
	/** Voices connect here */
	input: GainNode
	noise: AudioBuffer
	delay: DelayNode
	delayWet: GainNode
	reverbWet: GainNode
}

/** input → dry + tempo-synced delay + reverb → compressor → speakers */
function rig(c: BaseAudioContext): Rig {
	const input = c.createGain()
	const comp = c.createDynamicsCompressor()
	const master = c.createGain()
	master.gain.value = 0.6
	master.connect(comp).connect(c.destination)
	input.connect(master)

	const delay = c.createDelay(2)
	const feedback = c.createGain()
	feedback.gain.value = 0.35
	const delayWet = c.createGain()
	delayWet.gain.value = 0
	input.connect(delay).connect(feedback).connect(delay)
	delay.connect(delayWet).connect(master)

	const reverb = c.createConvolver()
	reverb.buffer = impulse(c, 2)
	const reverbWet = c.createGain()
	reverbWet.gain.value = 0
	input.connect(reverb).connect(reverbWet).connect(master)

	const noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
	const data = noise.getChannelData(0)
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

	return { c, input, noise, delay, delayWet, reverbWet }
}

/** Stereo noise that fades out — a cheap, decent room. */
function impulse(c: BaseAudioContext, seconds: number) {
	const len = c.sampleRate * seconds
	const buf = c.createBuffer(2, len, c.sampleRate)
	for (let ch = 0; ch < 2; ch++) {
		const d = buf.getChannelData(ch)
		for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
	}
	return buf
}

/**
 * Delay is a dotted eighth (3 sixteenths), so echoes land between beats.
 * Live changes glide to avoid clicks; `glide = 0` jumps (for export).
 */
function setFx({ c, delay, delayWet, reverbWet }: Rig, song: Song, glide = 0.05) {
	const t = c.currentTime
	delay.delayTime.setTargetAtTime((3 * 60) / song.bpm / 4, t, glide)
	delayWet.gain.setTargetAtTime((song.delay / 100) * 0.6, t, glide)
	reverbWet.gain.setTargetAtTime((song.reverb / 100) * 0.8, t, glide)
}

/** Gain node with an instant attack and exponential decay to silence. */
function env({ c, input }: Rig, t: number, peak: number, decay: number) {
	const g = c.createGain()
	g.gain.setValueAtTime(0, t)
	g.gain.linearRampToValueAtTime(peak, t + 0.005)
	g.gain.exponentialRampToValueAtTime(0.001, t + decay)
	g.connect(input)
	return g
}

function tone(r: Rig, t: number, hz: number, wave: OscillatorType, dur: number) {
	const osc = r.c.createOscillator()
	osc.type = wave
	osc.frequency.value = hz
	osc.connect(env(r, t, wave === 'sine' || wave === 'triangle' ? 0.35 : 0.15, dur))
	osc.start(t)
	osc.stop(t + dur)
}

function kick(r: Rig, t: number) {
	const osc = r.c.createOscillator()
	osc.frequency.setValueAtTime(150, t)
	osc.frequency.exponentialRampToValueAtTime(40, t + 0.15)
	osc.connect(env(r, t, 1, 0.35))
	osc.start(t)
	osc.stop(t + 0.35)
}

function hiss(r: Rig, t: number, type: BiquadFilterType, hz: number, peak: number, decay: number) {
	const src = r.c.createBufferSource()
	src.buffer = r.noise
	const filter = r.c.createBiquadFilter()
	filter.type = type
	filter.frequency.value = hz
	src.connect(filter).connect(env(r, t, peak, decay))
	src.start(t)
	src.stop(t + decay)
}

const drums = {
	kick,
	snare: (r: Rig, t: number) => hiss(r, t, 'bandpass', 1800, 0.7, 0.18),
	hat: (r: Rig, t: number) => hiss(r, t, 'highpass', 7000, 0.25, 0.05),
}

function voice(r: Rig, row: number, wave: OscillatorType, t: number) {
	const def = ROWS[row]
	if ('drum' in def) drums[def.drum](r, t)
	else tone(r, t, freq(def.midi), wave, 0.4)
}

function playStep(r: Rig, song: Song, slot: number, col: number, t: number) {
	const p = song.patterns[slot]
	for (let row = 0; row < ROWS.length; row++) if (isOn(p, row, col)) voice(r, row, song.wave, t)
}

/* ───────────────────────────── Live ───────────────────────────── */

let live: Rig | undefined

/** Created lazily: browsers only allow audio after a user gesture. */
function audio() {
	live ??= rig(new AudioContext())
	const c = live.c as AudioContext
	if (c.state === 'suspended') c.resume()
	return live
}

/** Plays one row now — used to preview a cell when it is switched on. */
export function playRow(row: number, song: Song) {
	const r = audio()
	setFx(r, song)
	voice(r, row, song.wave, r.c.currentTime)
}

/**
 * Starts playback. `song` is read on every step, so edits are heard at once.
 * With `solo`, loops the pattern it returns instead of the song's chain.
 * `onStep` fires in time with the audio; `link` is -1 when soloing.
 * Starts at step `from`. The returned stop function gives back the first
 * step not yet heard, so a pause can resume there.
 */
export function start(
	song: Song,
	onStep: (link: number, col: number) => void,
	solo?: () => number,
	from = 0,
) {
	const r = audio()
	const c = r.c
	let step = from
	let next = c.currentTime + 0.05
	const queue: { step: number; link: number; col: number; time: number }[] = []

	const timer = setInterval(() => {
		setFx(r, song)
		while (next < c.currentTime + LOOKAHEAD) {
			const { link, col } = solo
				? { link: -1, col: step % song.steps }
				: position(step, song.chain.length, song.steps)
			playStep(r, song, solo ? solo() : song.chain[link], col, next)
			queue.push({ step, link, col, time: next })
			next += 60 / song.bpm / 4 // 16th notes
			step++
		}
	}, TICK)

	let frame = requestAnimationFrame(function draw() {
		let due
		while (queue.length && queue[0].time <= c.currentTime) due = queue.shift()
		if (due) onStep(due.link, due.col)
		frame = requestAnimationFrame(draw)
	})

	return () => {
		clearInterval(timer)
		cancelAnimationFrame(frame)
		return queue[0]?.step ?? step
	}
}

/* ───────────────────────────── Export ───────────────────────────── */

/** Renders the whole chain once, plus a tail for the effects to ring out. */
export function render(song: Song) {
	const sixteenth = 60 / song.bpm / 4
	const length = song.chain.length * song.steps * sixteenth + TAIL
	const sampleRate = 44100
	const r = rig(new OfflineAudioContext(2, Math.ceil(length * sampleRate), sampleRate))
	setFx(r, song, 0)
	song.chain.forEach((slot, link) => {
		for (let col = 0; col < song.steps; col++) {
			playStep(r, song, slot, col, (link * song.steps + col) * sixteenth)
		}
	})
	return (r.c as OfflineAudioContext).startRendering()
}
