// Run: node src/components/animator/doc.check.ts
import assert from 'node:assert/strict'
import { decodeDoc, encodeDoc, makeEl, moveKey, newDoc, poseAt, readDoc, removeKey, setPose, visibleAt } from './doc.ts'

const el = makeEl('rect', 0, 24, { x: 10, y: 10 }, { w: 50, h: 50 })

// One key: every frame has it.
assert.equal(poseAt(el, 0).x, 10)
assert.equal(poseAt(el, 23).x, 10)

// Moving on frame 5 changes frame 5 and every later frame…
setPose(el, 5, { x: 100 })
assert.equal(poseAt(el, 4).x, 10)
assert.equal(poseAt(el, 5).x, 100)
assert.equal(poseAt(el, 23).x, 100)
assert.equal(poseAt(el, 5).y, 10) // only what changed

// …up to the next frame it was moved on, and no further.
setPose(el, 10, { x: 200 })
setPose(el, 3, { x: 50 })
assert.deepEqual(
	[2, 3, 4, 5, 9, 10, 20].map((f) => poseAt(el, f).x),
	[10, 50, 50, 100, 100, 200, 200],
)

// Moving again on a key frame replaces that key only.
setPose(el, 5, { y: 99 })
assert.deepEqual([poseAt(el, 5).x, poseAt(el, 5).y, poseAt(el, 10).y], [100, 99, 10])

// Before the first key, the first key holds.
const late = makeEl('ellipse', 8, 24, { x: 7 })
assert.equal(poseAt(late, 0).x, 7)
assert.ok(!visibleAt(late, 7) && visibleAt(late, 8) && visibleAt(late, 23))

// Tweening eases between keys and holds after the last.
const t = makeEl('rect', 0, 24, { x: 0 })
setPose(t, 10, { x: 100 })
assert.equal(poseAt(t, 5, true).x, 50)
assert.ok(poseAt(t, 2, true).x < 20)
assert.equal(poseAt(t, 15, true).x, 100)
// Moving between two keys while tweening starts from the eased pose.
setPose(t, 5, { y: 30 }, true)
assert.equal(t.keys[5].x, 50)

// Keys move in time, but never onto another key; the last one never goes.
assert.ok(moveKey(t, 10, 12))
assert.ok(!moveKey(t, 12, 0))
assert.deepEqual(Object.keys(t.keys).map(Number), [0, 5, 12])
removeKey(t, 0)
removeKey(t, 5)
removeKey(t, 12)
assert.deepEqual(Object.keys(t.keys).map(Number), [12])

// Documents round-trip through share links; junk doesn't load.
const doc = newDoc()
doc.els.push(el, late, makeEl('text', 0, 24, {}, { text: 'Hi <there>\n"you"' }), makeEl('path', 0, 24, {}, { points: [[0, 0], [5, 5], [10, 0]] }))
assert.deepEqual(await decodeDoc(await encodeDoc(doc)), doc)
assert.equal(await decodeDoc('nope'), null)
assert.equal(readDoc({ ...doc, fps: 0 }), null)
assert.equal(readDoc({ ...doc, frames: 9999 }), null)
assert.equal(readDoc({ ...doc, els: [{ ...el, fill: 'red;}' }] }), null)
assert.equal(readDoc({ ...doc, els: [{ ...el, keys: {} }] }), null)
assert.equal(readDoc({ ...doc, els: [{ ...el, kind: 'script' }] }), null)

console.log('animator: ok')
