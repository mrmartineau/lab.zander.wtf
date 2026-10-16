// Run: node src/components/animator/doc.check.ts
import assert from 'node:assert/strict'
import { decodeDoc, encodeDoc, makeEl, moveKey, newDoc, poseAt, pruned, readDoc, removeKey, setPose, visibleAt } from './doc.ts'

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

// Images: inline raster data only, and every image element needs its image.
const png = 'data:image/png;base64,iVBORw0KGgo='
const pic = makeEl('image', 0, 24, {}, { w: 10, h: 10, src: 'a' })
const withPic = { ...newDoc(), els: [pic], images: { a: png, unused: png } }
assert.deepEqual(await decodeDoc(await encodeDoc(withPic)), withPic)
assert.deepEqual(Object.keys(pruned(withPic).images), ['a'])
assert.equal(readDoc({ ...withPic, images: {} }), null)
for (const bad of ['https://example.com/x.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,"><script>']) {
	assert.equal(readDoc({ ...withPic, images: { a: bad } }), null, bad)
}
// Loaded ids end up in markup: unsafe ones are replaced, and inherited names don't pass as fonts, sizes or images.
const evil = readDoc({ ...doc, els: [{ ...el, id: '"><img src=x onerror=alert(1)>' }] })
assert.match(evil!.els[0].id, /^[a-z0-9]+$/)
assert.equal(readDoc({ ...doc, els: [{ ...el, font: 'toString' }] }), null)
assert.equal(readDoc({ ...doc, size: 'constructor' }), null)
assert.equal(readDoc({ ...withPic, els: [{ ...pic, src: 'toString' }] }), null)
assert.equal(readDoc({ ...withPic, images: { '"><b>': png } }), null)
// A small link that inflates past the limit is refused.
const bomb = new Uint8Array(50_000_000).fill(32)
const packed = new Uint8Array(await new Response(new Blob([bomb]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
let b64 = ''
for (const c of packed) b64 += String.fromCharCode(c)
assert.equal(await decodeDoc(btoa(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')), null)

// Documents saved before images existed still load.
const { images: _, ...old } = doc
assert.deepEqual(readDoc(JSON.parse(JSON.stringify(old)))?.images, {})

console.log('animator: ok')
