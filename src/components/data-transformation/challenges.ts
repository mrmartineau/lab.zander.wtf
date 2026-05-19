/**
 * Challenge data for the Data Transformation Dojo.
 *
 * Each challenge asks the user to write a `solve` function. The evaluator
 * compiles their code, runs it against every `test`, and compares the result
 * to the output of the reference `solution` — so expected values never have
 * to be hand-maintained here.
 */

export type Difficulty = 'easy' | 'medium' | 'hard'

/** One input case. `args` are spread into `solve(...)`. */
export interface Test {
	name: string
	args: unknown[]
}

export interface Challenge {
	id: string
	title: string
	/** The JS method / concept this drills — shown as a badge. */
	method: string
	difficulty: Difficulty
	/** Why this transform matters — real-world framing. */
	brief: string
	/** The precise instruction. */
	task: string
	/** Code the editor is seeded with. */
	starter: string
	/** Reference answer — also drives the expected test output. */
	solution: string
	/** Progressively revealed nudges. */
	hints: string[]
	/**
	 * Freeze every argument before the call so any mutation throws.
	 * Used for the non-mutating lessons (sorting, immutable updates).
	 */
	immutable?: boolean
	/** Input cases the user's `solve` is run against. */
	tests: Test[]
}

// ---------------------------------------------------------------------------
// Shared datasets — pretend these came back from an API.
// ---------------------------------------------------------------------------

const orders = [
	{ id: 1, customer: 'Ada', product: 'Keyboard', category: 'tech', price: 80, status: 'shipped' },
	{ id: 2, customer: 'Bram', product: 'Mug', category: 'home', price: 12, status: 'pending' },
	{ id: 3, customer: 'Ada', product: 'Monitor', category: 'tech', price: 240, status: 'shipped' },
	{ id: 4, customer: 'Cleo', product: 'Notebook', category: 'office', price: 6, status: 'cancelled' },
	{ id: 5, customer: 'Bram', product: 'Desk', category: 'home', price: 320, status: 'shipped' },
	{ id: 6, customer: 'Ada', product: 'Cable', category: 'tech', price: 9, status: 'pending' },
]

const orders2 = [
	{ id: 10, customer: 'Dee', product: 'Lamp', category: 'home', price: 45, status: 'shipped' },
	{ id: 11, customer: 'Eve', product: 'Pen', category: 'office', price: 3, status: 'pending' },
	{ id: 12, customer: 'Dee', product: 'Chair', category: 'home', price: 90, status: 'cancelled' },
]

const customers = [
	{ name: 'Ada', tier: 'gold' },
	{ name: 'Bram', tier: 'silver' },
	{ name: 'Cleo', tier: 'bronze' },
]

const customers2 = [
	{ name: 'Dee', tier: 'gold' },
	{ name: 'Eve', tier: 'silver' },
]

export const challenges: Challenge[] = [
	// 1 -----------------------------------------------------------------
	{
		id: 'map-pick',
		title: 'Trim orders down to list rows',
		method: 'map',
		difficulty: 'easy',
		brief: 'API records carry far more than a list row needs. A `map` is a one-to-one transform: same length out, but each item reshaped to exactly the fields the UI renders.',
		task: 'Return a new array with one object `{ id, label }` per order, where `label` is the string `"<product> — <customer>"` (note the em-dash, with a space either side).',
		starter: `function solve(orders) {
  // Reshape each order into { id, label }.
}`,
		solution: `function solve(orders) {
  return orders.map((order) => ({
    id: order.id,
    label: \`\${order.product} — \${order.customer}\`,
  }))
}`,
		hints: [
			'`orders.map(callback)` runs your callback once per order and collects what you return.',
			'Your callback should return an object literal. Wrap it in parentheses so the arrow function does not read `{` as a function body: `(order) => ({ ... })`.',
			'Build the label with a template literal: `` `${order.product} — ${order.customer}` ``.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 2 -----------------------------------------------------------------
	{
		id: 'map-derive',
		title: 'Add a computed field',
		method: 'map · spread',
		difficulty: 'easy',
		brief: 'A classic interview ask: keep every original field, but tack on a derived one. Spread copies the record, then you add the extra key.',
		task: 'Return the orders unchanged except each gains a `priceWithTax` field — the `price` plus 20% VAT, rounded to 2 decimal places.',
		starter: `function solve(orders) {
  // Keep each order, add priceWithTax (price + 20%).
}`,
		solution: `function solve(orders) {
  return orders.map((order) => ({
    ...order,
    priceWithTax: Math.round(order.price * 1.2 * 100) / 100,
  }))
}`,
		hints: [
			'Spread the original record first so you keep every field: `{ ...order, /* extras */ }`.',
			'`price * 1.2` adds 20%. Keys written after the spread win, so put `priceWithTax` last.',
			'Round to 2dp with `Math.round(n * 100) / 100`.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 3 -----------------------------------------------------------------
	{
		id: 'filter-shipped',
		title: 'Keep only shipped orders',
		method: 'filter',
		difficulty: 'easy',
		brief: '`filter` returns the items where your callback is truthy — same shape as the input, just shorter.',
		task: "Return a new array containing only the orders whose `status` is exactly `'shipped'`.",
		starter: `function solve(orders) {
  // Keep orders with status === 'shipped'.
}`,
		solution: `function solve(orders) {
  return orders.filter((order) => order.status === 'shipped')
}`,
		hints: [
			'`orders.filter(callback)` keeps an item when the callback returns a truthy value.',
			"Compare with strict equality: `order.status === 'shipped'`.",
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 4 -----------------------------------------------------------------
	{
		id: 'filter-set',
		title: 'Filter against an allow-list',
		method: 'filter · Set',
		difficulty: 'easy',
		brief: 'When "is this one of N values?" comes up, a `Set` reads cleaner than a chain of `||` comparisons and gives O(1) membership checks.',
		task: 'Given the orders and an array of `categories`, return only the orders whose `category` appears in that list.',
		starter: `function solve(orders, categories) {
  // Keep orders whose category is in the categories list.
}`,
		solution: `function solve(orders, categories) {
  const wanted = new Set(categories)
  return orders.filter((order) => wanted.has(order.category))
}`,
		hints: [
			'`new Set(categories)` gives you a set with a fast `.has()` method.',
			'Filter the orders, keeping each one where `wanted.has(order.category)` is true.',
		],
		tests: [
			{ name: "tech + home", args: [orders, ['tech', 'home']] },
			{ name: 'office only', args: [orders2, ['office']] },
		],
	},
	// 5 -----------------------------------------------------------------
	{
		id: 'chain',
		title: 'Chain filter then map',
		method: 'filter → map',
		difficulty: 'easy',
		brief: 'The bread-and-butter pipeline: narrow the list, then reshape what is left. Filter first so `map` does less work.',
		task: 'Return an array of the `product` names of every order whose `status` is `\'pending\'`.',
		starter: `function solve(orders) {
  // Pending orders → their product names.
}`,
		solution: `function solve(orders) {
  return orders
    .filter((order) => order.status === 'pending')
    .map((order) => order.product)
}`,
		hints: [
			'Methods chain: `orders.filter(...).map(...)` — `filter` returns an array, so `map` runs straight after it.',
			"Filter to `status === 'pending'`, then map each survivor to `order.product`.",
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 6 -----------------------------------------------------------------
	{
		id: 'reduce-sum',
		title: 'Total the revenue',
		method: 'reduce',
		difficulty: 'easy',
		brief: '`reduce` collapses a list into a single value. The textbook case is a running sum.',
		task: 'Return the sum of every order’s `price` as one number.',
		starter: `function solve(orders) {
  // Sum every order.price.
}`,
		solution: `function solve(orders) {
  return orders.reduce((total, order) => total + order.price, 0)
}`,
		hints: [
			'`reduce` takes a callback `(accumulator, item) => newAccumulator` and a starting value.',
			'Start the accumulator at `0` (the second argument to `reduce`) and return `total + order.price` each step.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 7 -----------------------------------------------------------------
	{
		id: 'reduce-tally',
		title: 'Count orders by status',
		method: 'reduce',
		difficulty: 'medium',
		brief: 'Tallying occurrences into an object of counts is a `reduce` where the accumulator is a plain object.',
		task: 'Return an object mapping each `status` to how many orders have it, e.g. `{ shipped: 3, pending: 2, cancelled: 1 }`.',
		starter: `function solve(orders) {
  // Build { [status]: count }.
}`,
		solution: `function solve(orders) {
  return orders.reduce((counts, order) => {
    counts[order.status] = (counts[order.status] ?? 0) + 1
    return counts
  }, {})
}`,
		hints: [
			'Use `reduce` with an empty object `{}` as the starting accumulator.',
			'First time a status is seen there is no count yet — `(counts[order.status] ?? 0) + 1` treats "missing" as zero.',
			'Do not forget to `return counts` at the end of the callback so the next step gets it.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 8 -----------------------------------------------------------------
	{
		id: 'reduce-max',
		title: 'Find the priciest order',
		method: 'reduce',
		difficulty: 'medium',
		brief: 'Min/max by a field is a `reduce` that keeps a running winner — no starting value needed, the first item seeds it.',
		task: 'Return the single order object with the highest `price`.',
		starter: `function solve(orders) {
  // Return the order with the largest price.
}`,
		solution: `function solve(orders) {
  return orders.reduce((top, order) =>
    order.price > top.price ? order : top,
  )
}`,
		hints: [
			'Call `reduce` with no starting value — the first order becomes the initial `top`.',
			'Each step, keep whichever of `top` and `order` has the bigger `price`: a ternary does it in one line.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 9 -----------------------------------------------------------------
	{
		id: 'group-by',
		title: 'Group orders into category buckets',
		method: 'grouping',
		difficulty: 'medium',
		brief: 'Splitting a flat list into buckets keyed by a field is one of the most common reshapes there is.',
		task: 'Return an object whose keys are categories and whose values are arrays of the orders in that category.',
		starter: `function solve(orders) {
  // { tech: [...], home: [...], office: [...] }
}`,
		solution: `function solve(orders) {
  const groups = {}
  for (const order of orders) {
    groups[order.category] ??= []
    groups[order.category].push(order)
  }
  return groups
}`,
		hints: [
			'Walk the orders one by one, dropping each into a bucket keyed by `order.category`.',
			'`groups[key] ??= []` creates the array the first time a key is seen, then you can `.push()` into it.',
			'Modern runtimes have `Object.groupBy(orders, (o) => o.category)` which does exactly this in one call.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 10 ----------------------------------------------------------------
	{
		id: 'index-map',
		title: 'Index a list by id',
		method: 'Map',
		difficulty: 'medium',
		brief: 'If you ever `list.find(...)` inside a loop you have built an accidental O(n²). Index the list once into a `Map` and every lookup is O(1).',
		task: 'Return a `Map` whose keys are each order’s `id` and whose values are the whole order object.',
		starter: `function solve(orders) {
  // Build a Map from id → order.
}`,
		solution: `function solve(orders) {
  return new Map(orders.map((order) => [order.id, order]))
}`,
		hints: [
			'`new Map(pairs)` builds a Map from an array of `[key, value]` pairs.',
			'`map` each order into the pair `[order.id, order]`, then hand that array to `new Map(...)`.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 11 ----------------------------------------------------------------
	{
		id: 'set-dedupe',
		title: 'List the distinct categories',
		method: 'Set',
		difficulty: 'easy',
		brief: 'A `Set` holds unique values — the single most common use is deduping a field down to its distinct values.',
		task: 'Return an array of the unique `category` values, in first-seen order.',
		starter: `function solve(orders) {
  // Unique categories as an array.
}`,
		solution: `function solve(orders) {
  return [...new Set(orders.map((order) => order.category))]
}`,
		hints: [
			'`map` the orders down to just their categories first.',
			'`new Set(array)` drops duplicates; spread it back into an array with `[...set]`.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 12 ----------------------------------------------------------------
	{
		id: 'join',
		title: 'Join two endpoints',
		method: 'Map · join',
		difficulty: 'hard',
		brief: 'Real apps stitch data from multiple endpoints. The wrong way is `.map` with a `.find` inside it. The right way: index one side into a `Map`, then `map` the other against it.',
		task: "Given `orders` and `customers`, return the orders each with an added `tier` field — the matching customer’s tier, or `'none'` if there is no match.",
		starter: `function solve(orders, customers) {
  // Add each order's customer tier.
}`,
		solution: `function solve(orders, customers) {
  const tierByName = new Map(customers.map((c) => [c.name, c.tier]))
  return orders.map((order) => ({
    ...order,
    tier: tierByName.get(order.customer) ?? 'none',
  }))
}`,
		hints: [
			'Index the customers first: a `Map` from `name` → `tier`.',
			'Then `map` the orders, spreading each one and adding `tier`.',
			"`map.get(name)` returns `undefined` for a missing key — `?? 'none'` supplies the fallback.",
		],
		tests: [
			{ name: 'orders + customers', args: [orders, customers] },
			{ name: 'orders2 + customers2', args: [orders2, customers2] },
		],
	},
	// 13 ----------------------------------------------------------------
	{
		id: 'sort-immutable',
		title: 'Sort without mutating',
		method: 'toSorted',
		difficulty: 'medium',
		brief: 'Plain `.sort()` mutates the array in place — a bug when the array is React state or props. `toSorted` returns a sorted copy and leaves the original untouched. (The input here is frozen, so `.sort()` will throw.)',
		task: 'Return a new array of the orders sorted by `price`, cheapest first. Do not mutate the input.',
		starter: `function solve(orders) {
  // Cheapest first — without mutating orders.
}`,
		solution: `function solve(orders) {
  return orders.toSorted((a, b) => a.price - b.price)
}`,
		hints: [
			'`toSorted(comparator)` (ES2023) returns a sorted copy — `sort` would mutate the input.',
			'A numeric comparator is `(a, b) => a.price - b.price`: negative keeps `a` first.',
			'Pre-2023 you would spread first: `[...orders].sort(...)`.',
		],
		immutable: true,
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
	// 14 ----------------------------------------------------------------
	{
		id: 'entries-to-array',
		title: 'Keyed object → renderable array',
		method: 'Object.entries',
		difficulty: 'medium',
		brief: 'APIs love handing you an object keyed by id. React wants an array to `.map()` in JSX. `Object.entries` bridges the gap.',
		task: 'Given an object keyed by id (`{ u1: { name: "Ada" }, ... }`), return an array of those values, each with its key folded in as an `id` field.',
		starter: `function solve(usersById) {
  // { u1: {name}, ... } → [{ id: 'u1', name }, ...]
}`,
		solution: `function solve(usersById) {
  return Object.entries(usersById).map(([id, user]) => ({
    id,
    ...user,
  }))
}`,
		hints: [
			'`Object.entries(obj)` gives you an array of `[key, value]` pairs.',
			'`map` each pair, destructuring it as `[id, user]`, into `{ id, ...user }`.',
		],
		tests: [
			{ name: 'two users', args: [{ u1: { name: 'Ada' }, u2: { name: 'Bram' } }] },
			{ name: 'one user', args: [{ a: { name: 'Cleo', age: 9 } }] },
		],
	},
	// 15 ----------------------------------------------------------------
	{
		id: 'transform-values',
		title: 'Transform an object’s values',
		method: 'entries → fromEntries',
		difficulty: 'hard',
		brief: 'The `entries → map → fromEntries` round-trip lets you rewrite every value of an object while keeping its shape.',
		task: 'Given a `prices` object (`{ keyboard: 80, ... }`), return a new object with the same keys but every price reduced by 10%, rounded to 2 decimal places.',
		starter: `function solve(prices) {
  // Apply a 10% discount to every value.
}`,
		solution: `function solve(prices) {
  return Object.fromEntries(
    Object.entries(prices).map(([name, price]) => [
      name,
      Math.round(price * 0.9 * 100) / 100,
    ]),
  )
}`,
		hints: [
			'`Object.entries` to get pairs, transform them, `Object.fromEntries` to rebuild the object.',
			'`map` each `[name, price]` pair to a new pair `[name, discountedPrice]` — keep the key, change the value.',
			'`price * 0.9` is a 10% discount; round with `Math.round(n * 100) / 100`.',
		],
		tests: [
			{ name: 'three prices', args: [{ keyboard: 80, monitor: 240, cable: 9 }] },
			{ name: 'two prices', args: [{ desk: 320, mug: 12 }] },
		],
	},
	// 16 ----------------------------------------------------------------
	{
		id: 'flat',
		title: 'Un-nest an array of arrays',
		method: 'flat',
		difficulty: 'easy',
		brief: '`flat` pulls the items of inner arrays up to the top level. By default it only unwraps one level.',
		task: 'Given an array that contains other arrays, return a single flat array of all the inner items (one level of nesting).',
		starter: `function solve(nested) {
  // [['a','b'],['c']] → ['a','b','c']
}`,
		solution: `function solve(nested) {
  return nested.flat()
}`,
		hints: [
			'`array.flat()` merges one level of nested arrays into the parent.',
			'Pass a depth — or `Infinity` — only when nesting goes deeper than one level. Here one level is enough.',
		],
		tests: [
			{ name: 'letters', args: [[['a', 'b'], ['c'], ['d', 'e']]] },
			{ name: 'numbers + a gap', args: [[[1], [2, 3], []]] },
		],
	},
	// 17 ----------------------------------------------------------------
	{
		id: 'flatmap',
		title: 'Flatten paginated results',
		method: 'flatMap',
		difficulty: 'medium',
		brief: 'A paginated API hands back pages, each carrying its own list. `flatMap` is exactly "`map`, then `flat(1)`" — map to each page’s list, flatten them into one.',
		task: 'Given an array of pages (each `{ page, results: [...] }`), return one flat array of every result across all pages, in order.',
		starter: `function solve(pages) {
  // Merge every page.results into one array.
}`,
		solution: `function solve(pages) {
  return pages.flatMap((page) => page.results)
}`,
		hints: [
			'A plain `pages.map((p) => p.results)` leaves you with an array *of arrays*.',
			'`flatMap` does the map and a one-level flatten in a single call: `pages.flatMap((page) => page.results)`.',
		],
		tests: [
			{
				name: 'three pages',
				args: [
					[
						{ page: 1, results: ['Keyboard', 'Mug'] },
						{ page: 2, results: ['Monitor', 'Notebook'] },
						{ page: 3, results: ['Desk', 'Cable'] },
					],
				],
			},
			{
				name: 'two pages',
				args: [
					[
						{ page: 1, results: ['Lamp'] },
						{ page: 2, results: ['Pen', 'Chair'] },
					],
				],
			},
		],
	},
	// 18 ----------------------------------------------------------------
	{
		id: 'array-push',
		title: 'Add a todo to the end',
		method: 'push / spread',
		difficulty: 'easy',
		brief: 'Appending an item to the end of an array is the everyday "add to a list" operation — a new todo, a new chat message, a fresh log line.',
		task: 'Given a `todos` array and a `newTodo` string, add the new todo to the end and return the resulting array.',
		starter: `function solve(todos, newTodo) {
  // Append newTodo, return the array.
}`,
		solution: `function solve(todos, newTodo) {
  todos.push(newTodo)
  return todos
}`,
		hints: [
			'`array.push(item)` adds an item to the end of the array (and mutates it in place).',
			'`push` returns the new *length*, not the array — so `push` on its own line, then `return todos`.',
			'The non-mutating alternative is `return [...todos, newTodo]`, which builds a fresh array. Both pass here.',
		],
		tests: [
			{ name: 'two todos', args: [['Buy milk', 'Walk dog'], 'Write code'] },
			{ name: 'empty list', args: [[], 'First task'] },
		],
	},
	// 19 ----------------------------------------------------------------
	{
		id: 'array-pop',
		title: 'Pop the last action off a stack',
		method: 'pop',
		difficulty: 'easy',
		brief: 'An undo history is a stack: the most recent action sits on top. `pop` removes *and returns* that last item — the core move of any undo button.',
		task: 'Given a `history` array of actions, remove the most recent (last) action and return that removed action.',
		starter: `function solve(history) {
  // Remove and return the last action.
}`,
		solution: `function solve(history) {
  return history.pop()
}`,
		hints: [
			'`array.pop()` removes the last element and returns it — both at once.',
			'That return value is exactly what this challenge wants, so `return history.pop()`.',
			'`pop` is the mirror of `push`: `push` adds to the end, `pop` takes from the end.',
		],
		tests: [
			{ name: 'three actions', args: [['open file', 'type text', 'delete line']] },
			{ name: 'two actions', args: [['draw', 'erase']] },
		],
	},
	// 20 ----------------------------------------------------------------
	{
		id: 'pipeline',
		title: 'Putting it together',
		method: 'filter · group · reduce',
		difficulty: 'hard',
		brief: 'A realistic end-to-end transform: drop the noise, bucket the rest, summarise each bucket. Every step does exactly one job.',
		task: 'Drop cancelled orders, group the rest by category, then return an array of `{ category, orderCount, revenue }` — one summary object per category, in first-seen order. `revenue` is the sum of prices in that category.',
		starter: `function solve(orders) {
  // Drop cancelled → group by category → summarise.
}`,
		solution: `function solve(orders) {
  const groups = {}
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    groups[order.category] ??= []
    groups[order.category].push(order)
  }
  return Object.entries(groups).map(([category, group]) => ({
    category,
    orderCount: group.length,
    revenue: group.reduce((total, order) => total + order.price, 0),
  }))
}`,
		hints: [
			"First filter out `status === 'cancelled'`, then group the survivors by `category` (challenge 9).",
			'`Object.entries` turns the grouped object into `[category, group]` pairs you can `map`.',
			'For each pair: `orderCount` is `group.length`; `revenue` is a `reduce` summing `order.price`.',
		],
		tests: [
			{ name: 'orders', args: [orders] },
			{ name: 'orders2', args: [orders2] },
		],
	},
]
