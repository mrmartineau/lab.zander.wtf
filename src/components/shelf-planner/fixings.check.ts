// Run: node --experimental-strip-types src/components/shelf-planner/fixings.check.ts
import assert from 'node:assert/strict'
import { bracketsFor, defaultPlan, fixings, groupLengths, joinNote, stockLengths } from './model.ts'

// Brackets: never fewer than two, then one per 50cm.
assert.equal(bracketsFor(30), 2)
assert.equal(bracketsFor(120), 3)
assert.equal(bracketsFor(121), 4)

// Stock lengths pack the longest pieces first and allow for the saw cut.
assert.equal(stockLengths([120, 120]), 2)
assert.equal(stockLengths([119, 120]), 1)
assert.equal(stockLengths([100, 100, 40, 40, 140]), 2)
// A piece longer than one length is joined from two.
assert.equal(stockLengths([300]), 2)
assert.equal(stockLengths([]), 0)

assert.equal(groupLengths([40, 85, 40, 85.5]), '1 × 85.5cm, 1 × 85cm, 2 × 40cm')

// Only pieces over one length get the join note.
assert.equal(joinNote([120, 240]), '')
assert.match(joinNote([300]), /joined/)

// The starting plan, worked out by hand: 21 boards (7 left, 7 right, 7 back), each side shelf
// with a back-end batten too, so 35 pieces. Left 7 × (93 + 17), right 6 × (100 + 30) + (100 + 17),
// back 6 × 99 + 112 = 2373cm. Every board is 93 to 112cm, so 3 brackets each.
const f = fixings(defaultPlan())
assert.equal(f.battens.length, 35)
assert.equal(Math.round(f.battenRun), 2373)
assert.equal(f.stock, 11)
assert.equal(f.brackets, 63)

console.log('fixings ok')
