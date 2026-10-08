// Run: node src/components/loop-synth/song.check.ts
import assert from 'node:assert/strict'
import { midi, vlq, wav } from './export.ts'
import { DEFAULT_SONG, ROWS, decodeSong, encodeSong, freq, isOn, position, toggle } from './song.ts'

// Share links round-trip.
assert.deepEqual(decodeSong(encodeSong(DEFAULT_SONG)), DEFAULT_SONG)

// Links from before steps/effects existed still load, with defaults.
const old = btoa(JSON.stringify([DEFAULT_SONG.bpm, 'sine', DEFAULT_SONG.patterns, [0]]))
assert.deepEqual(decodeSong(old), {
	...DEFAULT_SONG,
	wave: 'sine',
	chain: [0],
	steps: 16,
	delay: 0,
	reverb: 0,
})

// Bad hashes fall back to null, not a broken song.
const bad = (...v: unknown[]) => btoa(JSON.stringify(v))
const P = DEFAULT_SONG.patterns
assert.equal(decodeSong(''), null)
assert.equal(decodeSong('%%%'), null)
assert.equal(decodeSong(bad(999, 'sine', P, [0])), null)
assert.equal(decodeSong(bad(120, 'evil', P, [0])), null)
assert.equal(decodeSong(bad(120, 'sine', P, [4])), null)
assert.equal(decodeSong(bad(120, 'sine', P, [])), null)
assert.equal(decodeSong(bad(120, 'sine', [[1]], [0])), null)
assert.equal(decodeSong(bad(120, 'sine', P, [0], 24)), null)
assert.equal(decodeSong(bad(120, 'sine', P, [0], 16, 101)), null)

// Toggle flips one cell only, including step 31 (the sign bit).
const p = ROWS.map(() => 0)
toggle(p, 3, 31)
assert.ok(isOn(p, 3, 31) && !isOn(p, 3, 30) && !isOn(p, 2, 31))
assert.equal(p[3], 2 ** 31) // stays a positive integer, so it survives the hash
toggle(p, 3, 31)
assert.equal(p[3], 0)

// Steps walk through the chain, then loop.
assert.deepEqual(position(0, 3, 16), { link: 0, col: 0 })
assert.deepEqual(position(17, 3, 16), { link: 1, col: 1 })
assert.deepEqual(position(48, 3, 16), { link: 0, col: 0 })
assert.deepEqual(position(33, 3, 32), { link: 1, col: 1 })

assert.equal(freq(69), 440)
assert.equal(Math.round(freq(60) * 100) / 100, 261.63)

// WAV: header + 2 channels × 3 frames × 2 bytes.
const w = wav([new Float32Array([0, 1, -1]), new Float32Array([0, 0.5, 2])], 44100)
const wv = new DataView(w.buffer)
assert.equal(w.length, 44 + 12)
assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF')
assert.equal(wv.getUint32(40, true), 12)
assert.equal(wv.getInt16(48, true), 0x7fff) // left, frame 1
assert.equal(wv.getInt16(52, true), -0x8000) // left, frame 2
assert.equal(wv.getInt16(54, true), 0x7fff) // right, frame 2, clipped

// MIDI: variable-length numbers, header, and one kick note.
assert.deepEqual(vlq(0), [0])
assert.deepEqual(vlq(0x7f), [0x7f])
assert.deepEqual(vlq(0x80), [0x81, 0x00])
assert.deepEqual(vlq(0x3fff), [0xff, 0x7f])
const empty = ROWS.map(() => 0)
const kickOnly = ROWS.map((_, r) => (ROWS[r].name === 'Kick' ? 1 : 0))
const m = midi({ ...DEFAULT_SONG, bpm: 120, patterns: [kickOnly, empty, empty, empty], chain: [0] })
assert.equal(String.fromCharCode(...m.slice(0, 4)), 'MThd')
assert.equal(String.fromCharCode(...m.slice(14, 18)), 'MTrk')
const track = [...m.slice(22)]
assert.equal(new DataView(m.buffer).getUint32(18), track.length)
// tempo 500000 µs, kick on ch 10 at 0, off 24 ticks later, end of track
assert.deepEqual(track, [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0x99, 36, 100, 24, 0x89, 36, 0, 0, 0xff, 0x2f, 0])

console.log('song.check: ok')
