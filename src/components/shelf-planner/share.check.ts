// Run: node --experimental-strip-types src/components/shelf-planner/share.check.ts
import assert from 'node:assert/strict'
import { decodeShare, defaultPlan, encodeShare, shareCodeFrom } from './model.ts'

// A plan round-trips, name and all, with fresh ids.
const plan = defaultPlan()
const back = decodeShare(encodeShare('Larder · deep back ✓', plan))
assert.ok(back)
assert.equal(back.name, 'Larder · deep back ✓')
assert.deepEqual(back.plan.room, plan.room)
assert.deepEqual(back.plan.depths, plan.depths)
assert.deepEqual(
	back.plan.levels.map(({ id, ...l }) => l),
	plan.levels.map(({ id, ...l }) => l),
)
// Ids aren't in the link, so each decoded level gets a fresh numeric one, all different.
assert.ok(back.plan.levels.every((l) => typeof l.id === 'number' && Number.isFinite(l.id)))
assert.equal(new Set(back.plan.levels.map((l) => l.id)).size, back.plan.levels.length)
// The code is URL-safe as it is.
assert.match(encodeShare('x', plan), /^[\w-]+$/)

// Broken or hostile links give null or a safe plan, never a crash.
assert.equal(decodeShare(''), null)
assert.equal(decodeShare('not base64 at all!'), null)
const hostile = btoa(JSON.stringify({ n: 5, p: { levels: [{ y: 'x' }, { y: 9999, id: 1 }, { y: 50, id: 1, L: 'nope' }] } }))
const safe = decodeShare(hostile)
assert.ok(safe)
assert.equal(safe.name, '')
assert.equal(safe.plan.levels.length, 2)
assert.equal(new Set(safe.plan.levels.map((l) => l.id)).size, 2)
assert.ok(safe.plan.levels.every((l) => l.y <= safe.plan.room.h - 10))
assert.equal(safe.plan.levels[0].L, '')
// Null levels are dropped and huge room numbers are clamped, so nothing renders as Infinity.
const wild = decodeShare(btoa(JSON.stringify({ p: { room: { dl: 1e308, dr: -1e308, w: 1e9 }, levels: [null, { y: 50, B: 'lg' }] } })))
assert.ok(wild)
assert.equal(wild.plan.levels.length, 1)
assert.ok(Object.values(wild.plan.room).every((v) => Number.isFinite(v) && v <= 500))

// New `?plan=CODE` links and old `#plan-CODE` / `#plan=CODE` links all read; other hashes give nothing.
const code = encodeShare('x', plan)
assert.equal(shareCodeFrom(`#plan-${code}`), code)
assert.equal(shareCodeFrom(`?plan=${code}`), code)
assert.equal(shareCodeFrom(`#plan=${code}`), code)
assert.equal(shareCodeFrom(`#admin=abc&plan=${code}`), code)
assert.equal(shareCodeFrom('#admin=abc'), '')
assert.equal(shareCodeFrom(`?plan=${code}#admin=abc`), code)
assert.ok(decodeShare(shareCodeFrom(`?plan=${code}`)))

console.log('share ok')
