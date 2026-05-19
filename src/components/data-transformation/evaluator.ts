/**
 * Runs a user's `solve` function against a challenge's tests.
 *
 * Expected output is derived by running the challenge's own reference
 * `solution` — never hand-written — so the two can never drift apart.
 */

import type { Challenge } from './challenges'

export interface TestResult {
	name: string
	passed: boolean
	/** Reference output, formatted for display. */
	expected: string
	/** User output (or the error message), formatted for display. */
	actual: string
	/** True when the user's code threw rather than returned. */
	errored: boolean
}

export interface RunResult {
	/** Every test passed (and there was at least one). */
	ok: boolean
	results: TestResult[]
	/** Set when the user's code could not even be compiled. */
	compileError?: string
}

function errMsg(err: unknown): string {
	return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/** Turn a code string into a callable `solve`, or throw a useful error. */
function compile(code: string): (...args: unknown[]) => unknown {
	const factory = new Function(
		`"use strict";\n${code}\n;return typeof solve === "function" ? solve : null;`,
	)
	const fn = factory()
	if (typeof fn !== 'function') {
		throw new Error('Your code must define a function named `solve`.')
	}
	return fn as (...args: unknown[]) => unknown
}

/** Recursively freeze so any mutation attempt throws (strict mode). */
function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const v of Object.values(value as Record<string, unknown>)) {
			deepFreeze(v)
		}
	}
	return value
}

/** Fresh, isolated copy of the args for one call. */
function prepArgs(args: unknown[], immutable?: boolean): unknown[] {
	return args.map((arg) => {
		const clone = structuredClone(arg)
		return immutable ? deepFreeze(clone) : clone
	})
}

/** Structural equality across primitives, arrays, objects, Map and Set. */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a === 'number' && typeof b === 'number') {
		return Number.isNaN(a) && Number.isNaN(b)
	}
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
		return false
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false
		}
		return a.every((v, i) => deepEqual(v, b[i]))
	}
	if (a instanceof Map || b instanceof Map) {
		if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) {
			return false
		}
		for (const [k, v] of a) {
			if (!b.has(k) || !deepEqual(v, b.get(k))) return false
		}
		return true
	}
	if (a instanceof Set || b instanceof Set) {
		if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) {
			return false
		}
		for (const v of a) if (!b.has(v)) return false
		return true
	}
	const ka = Object.keys(a as object)
	const kb = Object.keys(b as object)
	if (ka.length !== kb.length) return false
	return ka.every(
		(k) =>
			Object.prototype.hasOwnProperty.call(b, k) &&
			deepEqual(
				(a as Record<string, unknown>)[k],
				(b as Record<string, unknown>)[k],
			),
	)
}

/** Human-readable, single-line rendering of any value. */
export function formatValue(value: unknown): string {
	if (value === null) return 'null'
	if (value === undefined) return 'undefined'
	const t = typeof value
	if (t === 'string') return JSON.stringify(value)
	if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value)
	if (t === 'function') return 'ƒ'
	if (value instanceof Map) {
		const body = [...value.entries()]
			.map(([k, v]) => `${formatValue(k)} => ${formatValue(v)}`)
			.join(', ')
		return `Map(${value.size}) {${body ? ` ${body} ` : ''}}`
	}
	if (value instanceof Set) {
		const body = [...value].map((v) => formatValue(v)).join(', ')
		return `Set(${value.size}) {${body ? ` ${body} ` : ''}}`
	}
	if (Array.isArray(value)) {
		return `[${value.map((v) => formatValue(v)).join(', ')}]`
	}
	if (t === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.map(([k, v]) => `${k}: ${formatValue(v)}`)
			.join(', ')
		return `{${entries ? ` ${entries} ` : ''}}`
	}
	return String(value)
}

export function runChallenge(challenge: Challenge, code: string): RunResult {
	let userFn: (...args: unknown[]) => unknown
	try {
		userFn = compile(code)
	} catch (err) {
		return { ok: false, results: [], compileError: errMsg(err) }
	}

	const refFn = compile(challenge.solution)
	const results: TestResult[] = challenge.tests.map((test) => {
		let expected: unknown
		try {
			expected = refFn(...prepArgs(test.args, challenge.immutable))
		} catch (err) {
			// A failing reference solution is a bug in the challenge, not the user.
			return {
				name: test.name,
				passed: false,
				expected: `reference error: ${errMsg(err)}`,
				actual: '—',
				errored: true,
			}
		}
		try {
			const actual = userFn(...prepArgs(test.args, challenge.immutable))
			return {
				name: test.name,
				passed: deepEqual(expected, actual),
				expected: formatValue(expected),
				actual: formatValue(actual),
				errored: false,
			}
		} catch (err) {
			return {
				name: test.name,
				passed: false,
				expected: formatValue(expected),
				actual: errMsg(err),
				errored: true,
			}
		}
	})

	return {
		ok: results.length > 0 && results.every((r) => r.passed),
		results,
	}
}
