// One frame as SVG markup. The editor and the exports both draw with this.
import { FONTS, SIZES, pathD, poseAt, visibleAt, type Doc, type El } from './doc'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => +v.toFixed(2)

/** The shape itself, in the element's own coordinates. */
export function shapeSvg(el: El, extra = '') {
	const paint = `fill="${el.kind === 'line' ? 'none' : el.fill}" stroke="${el.strokeWidth > 0 ? el.stroke : 'none'}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${extra}`
	switch (el.kind) {
		case 'rect':
			return `<rect x="${n(-el.w / 2)}" y="${n(-el.h / 2)}" width="${n(el.w)}" height="${n(el.h)}" ${paint}/>`
		case 'ellipse':
			return `<ellipse rx="${n(el.w / 2)}" ry="${n(el.h / 2)}" ${paint}/>`
		case 'line':
		case 'path':
			return `<path d="${pathD(el.points, el.closed)}" ${paint}/>`
		case 'text': {
			const lines = el.text.split('\n')
			const lh = el.size * 1.2
			const top = -((lines.length - 1) * lh) / 2
			const spans = lines.map((l, i) => `<tspan x="0" y="${n(top + i * lh)}">${esc(l) || ' '}</tspan>`).join('')
			return `<text font-family="${esc(FONTS[el.font])}" font-size="${el.size}" font-weight="${el.bold ? 700 : 400}" text-anchor="middle" dominant-baseline="central" paint-order="stroke" xml:space="preserve" ${paint}>${spans}</text>`
		}
	}
}

export const transform = (el: El, frame: number, tween: boolean) => {
	const p = poseAt(el, frame, tween)
	return { pose: p, attr: `transform="translate(${n(p.x)} ${n(p.y)}) rotate(${n(p.rotate)}) scale(${n(p.scale)})" opacity="${n(p.opacity)}"` }
}

/** Every element showing on a frame. `hit` adds wide see-through strokes so thin lines are easy to grab. */
export function elementsSvg(doc: Doc, frame: number, hit = false) {
	return doc.els
		.filter((el) => visibleAt(el, frame))
		.map((el) => {
			const { attr } = transform(el, frame, doc.tween)
			const grab = hit && (el.kind === 'line' || el.kind === 'path') ? shapeSvg({ ...el, strokeWidth: Math.max(14, el.strokeWidth), stroke: '#000000' }, ' class="hit"') : ''
			return `<g data-id="${el.id}" ${attr}>${grab}${shapeSvg(el)}</g>`
		})
		.join('')
}

/** A whole standalone SVG file for a frame. */
export function frameSvg(doc: Doc, frame: number) {
	const [w, h] = SIZES[doc.size]
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${doc.bg}"/>${elementsSvg(doc, frame)}</svg>`
}
