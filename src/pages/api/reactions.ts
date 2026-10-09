// Hearts and views for lab pages, kept in zander.wtf's reactions database
// (REACTIONS_DB, schema in zander.wtf-astro/migrations/reactions). Every row
// is stored under /lab/<slug>, so lab rows never mix with zander.wtf pages.
// The page POSTs one action and gets the item's counts back.
// A visitor is a random id the browser keeps in localStorage: views are unique
// visitors. Opening any page with #admin=<REACTIONS_ADMIN_TOKEN> stops your
// own views counting.
// ponytail: any slug that matches SLUG is accepted, real lab item or not.
// /stats only shows real items. Add a Cloudflare rate limiting rule on
// /api/reactions if made-up rows ever pile up.
import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

export const prerender = false

const MAX_HEARTS = 10 // per visitor per page
const SLUG = /^[\w-]{1,100}$/
const VISITOR = /^[0-9a-f-]{36}$/
const PREFIX = '/lab/'

export type Counts = { views: number; hearts: number; myHearts: number; heartsLeft: number }
export type Stats = {
	items: { slug: string; views: number; hearts: number }[]
	visitors: number
	recent: { slug: string; n: number; city: string | null; country: string | null; at: number }[]
}

const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

// Hash both sides so the comparison time says nothing about the token.
const sha256 = async (text: string) =>
	[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].join()

async function isAdmin(token: unknown, secret: string | undefined) {
	if (typeof token !== 'string' || !token || !secret) return false
	return (await sha256(token)) === (await sha256(secret))
}

async function stats(db: D1Database): Promise<Stats> {
	const like = `${PREFIX}%`
	const [items, visitors, recent] = await db.batch([
		db
			.prepare(
				`SELECT slug, SUM(v) AS views, SUM(h) AS hearts FROM (
					SELECT slug, COUNT(*) AS v, 0 AS h FROM views WHERE slug LIKE ?1 GROUP BY slug
					UNION ALL SELECT slug, 0, SUM(n) FROM hearts WHERE slug LIKE ?1 GROUP BY slug
				) GROUP BY slug ORDER BY views DESC, hearts DESC`,
			)
			.bind(like),
		db.prepare('SELECT COUNT(DISTINCT visitor) AS n FROM views WHERE slug LIKE ?').bind(like),
		db
			.prepare(
				`SELECT slug, n, city, country, updated_at AS at FROM hearts
				 WHERE slug LIKE ? AND updated_at IS NOT NULL ORDER BY at DESC LIMIT 40`,
			)
			.bind(like),
	])
	const strip = <T extends { slug: string }>(rows: T[]) =>
		rows.map((r) => ({ ...r, slug: r.slug.slice(PREFIX.length) }))
	return {
		items: strip(items.results as Stats['items']),
		visitors: (visitors.results[0] as { n: number }).n,
		recent: strip(recent.results as Stats['recent']),
	}
}

async function counts(db: D1Database, slug: string, visitor: string): Promise<Counts> {
	const [views, hearts] = await db.batch([
		db.prepare('SELECT COUNT(*) AS n FROM views WHERE slug = ?').bind(slug),
		db
			.prepare(
				'SELECT COALESCE(SUM(n), 0) AS n, COALESCE(SUM(CASE WHEN visitor = ?2 THEN n END), 0) AS mine FROM hearts WHERE slug = ?1',
			)
			.bind(slug, visitor),
	])
	const heart = hearts.results[0] as { n: number; mine: number }
	return {
		views: (views.results[0] as { n: number }).n,
		hearts: heart.n,
		myHearts: heart.mine,
		heartsLeft: MAX_HEARTS - heart.mine,
	}
}

export const POST: APIRoute = async ({ request }) => {
	const body: Record<string, unknown> = (await request.json().catch(() => null)) ?? {}
	const db = env.REACTIONS_DB

	if (body.action === 'stats') return json(await stats(db))

	const { visitor, action } = body
	if (typeof body.slug !== 'string' || !SLUG.test(body.slug)) {
		return json({ error: 'Invalid slug' }, 400)
	}
	if (typeof visitor !== 'string' || !VISITOR.test(visitor)) {
		return json({ error: 'Invalid visitor' }, 400)
	}
	const slug = PREFIX + body.slug

	if (action === 'view') {
		const secret = (env as { REACTIONS_ADMIN_TOKEN?: string }).REACTIONS_ADMIN_TOKEN
		if (!(await isAdmin(body.token, secret)))
			await db.prepare('INSERT OR IGNORE INTO views (slug, visitor) VALUES (?, ?)').bind(slug, visitor).run()
	} else if (action === 'heart') {
		// Where the visitor is, from Cloudflare: shown on /stats.
		const { city, country } = (request.cf ?? {}) as { city?: string; country?: string }
		await db
			.prepare(
				`INSERT INTO hearts (slug, visitor, city, country, updated_at)
				 VALUES (?, ?, ?, ?, unixepoch())
				 ON CONFLICT DO UPDATE SET n = n + 1, city = excluded.city,
				   country = excluded.country, updated_at = excluded.updated_at
				 WHERE n < ${MAX_HEARTS}`,
			)
			.bind(slug, visitor, city ?? null, country ?? null)
			.run()
	} else if (action !== 'state') {
		return json({ error: 'Invalid action' }, 400)
	}

	return json(await counts(db, slug, visitor))
}
