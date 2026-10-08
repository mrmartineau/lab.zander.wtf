/**
 * File encoders for the loop synth. Pure — checked in `song.check.ts`.
 */
import { ROWS, isOn, type Song } from './song.ts'

/** 16-bit PCM WAV from planar float channels. */
export function wav(channels: Float32Array[], sampleRate: number) {
	const frames = channels[0].length
	const bytes = frames * channels.length * 2
	const view = new DataView(new ArrayBuffer(44 + bytes))
	const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))

	text(0, 'RIFF')
	view.setUint32(4, 36 + bytes, true)
	text(8, 'WAVE')
	text(12, 'fmt ')
	view.setUint32(16, 16, true) // fmt chunk size
	view.setUint16(20, 1, true) // PCM
	view.setUint16(22, channels.length, true)
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * channels.length * 2, true) // bytes per second
	view.setUint16(32, channels.length * 2, true) // bytes per frame
	view.setUint16(34, 16, true) // bits per sample
	text(36, 'data')
	view.setUint32(40, bytes, true)

	let at = 44
	for (let i = 0; i < frames; i++) {
		for (const ch of channels) {
			const s = Math.max(-1, Math.min(1, ch[i]))
			view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true)
			at += 2
		}
	}
	return new Uint8Array(view.buffer)
}

const PPQ = 96 // ticks per quarter note
const SIXTEENTH = PPQ / 4

/** MIDI variable-length quantity. */
export function vlq(n: number) {
	const out = [n & 0x7f]
	while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80)
	return out
}

/**
 * Standard MIDI file (format 0), the chain played once. Melody on channel 1,
 * drums on channel 10 so any General MIDI player gives them drum sounds.
 */
export function midi(song: Song) {
	const events: { tick: number; bytes: number[] }[] = []
	song.chain.forEach((slot, link) => {
		const p = song.patterns[slot]
		for (let col = 0; col < song.steps; col++) {
			const tick = (link * song.steps + col) * SIXTEENTH
			ROWS.forEach((row, r) => {
				if (!isOn(p, r, col)) return
				const ch = 'drum' in row ? 9 : 0
				events.push({ tick, bytes: [0x90 | ch, row.midi, 100] })
				events.push({ tick: tick + SIXTEENTH, bytes: [0x80 | ch, row.midi, 0] })
			})
		}
	})
	// Note-offs first at equal ticks, so a repeated note is not cut short.
	events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0))

	const usPerQuarter = Math.round(60_000_000 / song.bpm)
	const track = [0x00, 0xff, 0x51, 0x03, usPerQuarter >> 16, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff]
	let last = 0
	for (const e of events) {
		track.push(...vlq(e.tick - last), ...e.bytes)
		last = e.tick
	}
	track.push(0x00, 0xff, 0x2f, 0x00) // end of track

	const u32 = (n: number) => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
	return new Uint8Array([
		...[0x4d, 0x54, 0x68, 0x64], // MThd
		...u32(6),
		0, 0, // format 0
		0, 1, // one track
		PPQ >> 8, PPQ & 0xff,
		...[0x4d, 0x54, 0x72, 0x6b], // MTrk
		...u32(track.length),
		...track,
	])
}
