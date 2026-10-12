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

// The starting plan is a U (left, back and right on every level). Side shelves take battens: each
// has its side wall and the back wall, so 14 boards give 28 pieces. Left 7 × (93 + 17), right
// 6 × (100 + 30) + (100 + 17) = 1667cm. The 7 back shelves sit between side shelves, so they need
// brackets (3 each), and battens alone are not possible.
const f = fixings(defaultPlan())
assert.equal(f.battens.length, 28)
assert.equal(Math.round(f.battenRun), 1667)
assert.equal(f.brackets, 63)
assert.equal(f.mixBrackets, 21)
assert.equal(f.battensOnly, false)

// With no side shelves, the back shelf runs wall to wall: battens along the back and at both ends.
const back = defaultPlan()
for (const l of back.levels) (l.L = ''), (l.R = '')
const g = fixings(back)
assert.equal(g.battensOnly, true)
assert.equal(g.mixBrackets, 0)
assert.equal(g.battens.length, back.levels.filter((l) => l.B).length * 3)

console.log('fixings ok')
