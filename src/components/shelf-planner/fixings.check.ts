// Run: node src/components/shelf-planner/fixings.check.ts
import assert from 'node:assert/strict'
import { boards, bracketsFor, defaultPlan, fixings, groupLengths, stockLengths } from './model.ts'

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

// Side shelves need a back-end batten too, so there are more batten pieces than boards.
const plan = defaultPlan()
const b = boards(plan)
const f = fixings(plan)
const sides = b.filter((x) => x.wall === 'Left' || x.wall === 'Right').length
assert.equal(f.battens.length, b.length + sides)
assert.equal(f.brackets, b.reduce((a, x) => a + bracketsFor(x.len), 0))

console.log('fixings ok')
