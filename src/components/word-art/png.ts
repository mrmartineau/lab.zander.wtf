// PNG export. The browser can't screenshot the DOM, but it can rasterise an
// SVG whose <foreignObject> holds HTML — so we rebuild the word as a tiny
// standalone HTML document (same CSS as the copy-paste export), inline the web
// font as data URIs (images can't fetch anything), and draw that onto a canvas.

import {
	baseCss,
	bounds,
	exportCode,
	resolvedFontHref,
	rootVars,
	SYSTEM_FONTS,
	type LetterGeo,
	type Metrics,
	type WAState,
} from './engine'

const toDataURL = (blob: Blob) =>
	new Promise<string>((resolve, reject) => {
		const r = new FileReader()
		r.onload = () => resolve(String(r.result))
		r.onerror = reject
		r.readAsDataURL(blob)
	})

/** Does a CSS `unicode-range` cover any of the code points? */
function covers(range: string, cps: Set<number>) {
	return range.split(',').some((part) => {
		const p = part.trim().replace(/^U\+/i, '')
		const [a, b] = p.includes('?') ? [p.replace(/\?/g, '0'), p.replace(/\?/g, 'F')] : p.split('-')
		const lo = parseInt(a, 16)
		const hi = parseInt(b ?? a, 16)
		for (const cp of cps) if (cp >= lo && cp <= hi) return true
		return false
	})
}

/** Google's @font-face rules for the family, with only the needed files inlined. */
async function embeddedFont(family: string, text: string): Promise<string> {
	if (SYSTEM_FONTS.has(family)) return ''
	const res = await fetch(resolvedFontHref(family))
	if (!res.ok) return ''
	const css = await res.text()
	const cps = new Set([...text].map((c) => c.codePointAt(0)!))
	const faces = css.match(/@font-face\s*{[^}]*}/g) ?? []
	const out = await Promise.all(
		faces.map(async (face) => {
			const range = face.match(/unicode-range:\s*([^;]+);/)?.[1]
			if (range && !covers(range, cps)) return ''
			const url = face.match(/url\(([^)]+)\)/)?.[1]
			if (!url) return ''
			const file = await fetch(url.replace(/['"]/g, ''))
			return face.replace(url, await toDataURL(await file.blob()))
		}),
	)
	return out.join('\n')
}

const download = (blob: Blob, name: string) => {
	const a = document.createElement('a')
	a.href = URL.createObjectURL(blob)
	a.download = name
	a.click()
	setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export interface SnapshotInput {
	state: WAState
	chars: string[]
	brs: number[]
	geo: LetterGeo[]
	metrics: Metrics
	wEm: number
	/** Background declarations (resolved from the stage), or null for a see-through PNG. */
	background: string | null
}

/**
 * Save the WordArt as a PNG (2× for crisp edges). Animation is frozen at rest.
 * Returns 'svg' when the browser refused to read the canvas back (older
 * Safari taints any canvas drawn from foreignObject) and an SVG was saved instead.
 */
export async function savePNG(input: SnapshotInput, name: string): Promise<'png' | 'svg'> {
	const s: WAState = { ...input.state, anim: 'none' }
	const b = bounds(s, input.metrics, input.geo)
	if (!b) throw new Error('Nothing to draw')

	const w0 = b.x1 - b.x0
	const h0 = b.y1 - b.y0
	const pad = Math.max(w0, h0) * 0.06
	// 2× for crispness, but keep the longest side under 4096px
	const scale = Math.min(2, 4096 / (Math.max(w0, h0) + pad * 2))
	const W = Math.ceil((w0 + pad * 2) * scale)
	const H = Math.ceil((h0 + pad * 2) * scale)

	const fonts = await embeddedFont(s.font, s.text)
	const vars = Object.entries(rootVars(s, input.wEm))
		.map(([k, v]) => `${k}: ${v};`)
		.join(' ')
	const { html } = exportCode(s, input.chars, input.geo, input.wEm, input.brs)
	const css = `${fonts}
.wordart { ${vars} }
${baseCss('.wordart', 'none')}
.snap { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; ${input.background ?? ''} }
.place { position: absolute; left: 0; top: 0; width: max-content; transform-origin: 0 0; transform: translate(${(pad - b.x0) * scale}px, ${(pad - b.y0) * scale}px) scale(${scale}); }`

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="snap"><style><![CDATA[${css}]]></style><div class="place">${html}</div></div></foreignObject></svg>`
	const svgBlob = new Blob([svg], { type: 'image/svg+xml' })

	const img = new Image()
	// A data: URL, not a blob: one — Chrome taints canvases drawn from blob SVGs
	img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
	try {
		await img.decode()
		const canvas = document.createElement('canvas')
		canvas.width = W
		canvas.height = H
		canvas.getContext('2d')!.drawImage(img, 0, 0)
		const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
		if (!png) throw new Error('toBlob failed')
		download(png, `${name}.png`)
		return 'png'
	} catch {
		download(svgBlob, `${name}.svg`)
		return 'svg'
	}
}
