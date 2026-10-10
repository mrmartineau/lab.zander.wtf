import type { APIRoute } from 'astro'
import { buildLabItems } from '../data/lab'

export const prerender = true

/** Every lab item plus the homepage. New items appear here on their own. */
export const GET: APIRoute = ({ site }) => {
	const items = buildLabItems(import.meta.glob('./*/index.{astro,md}', { eager: true }))
	const urls = [
		`<url><loc>${new URL('/', site)}</loc></url>`,
		...items.map(
			(item) =>
				`<url><loc>${new URL(`/${item.slug}/`, site)}</loc>${item.date ? `<lastmod>${item.date}</lastmod>` : ''}</url>`,
		),
	]
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
		{ headers: { 'Content-Type': 'application/xml' } },
	)
}
