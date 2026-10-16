// The editor: canvas tools, inspector, timeline and playback.
import {
	MAX_DOC_BYTES,
	MAX_FPS,
	MAX_FRAMES,
	SIZES,
	centre,
	clamp,
	decodeDoc,
	encodeDoc,
	keyFrames,
	makeEl,
	moveKey,
	newDoc,
	pathD,
	pruned,
	poseAt,
	readDoc,
	removeKey,
	setPose,
	thin,
	uid,
	visibleAt,
	type Doc,
	type El,
	type Font,
	type Kind,
	type Point,
	type Pose,
	type Size,
} from './doc'
import { png, svg as svgFile, video } from './export'
import { elementsSvg, frameSvg } from './render'

type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text'

const STORE = 'animator:doc'
const ICON: Record<Kind, string> = { rect: 'ph-square', ellipse: 'ph-circle', line: 'ph-line-segment', path: 'ph-pen-nib', text: 'ph-text-t', image: 'ph-image' }
const NAME: Record<Kind, string> = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', path: 'Path', text: 'Text', image: 'Image' }
/** Pasted images are scaled down to this on the long side. */
const MAX_IMAGE = 1600
const TOOL_KEYS: Record<string, Tool> = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', p: 'pen', t: 'text' }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A ball bouncing across, held two frames at a time, and a wobbling title. */
export function demo(): Doc {
	const d = newDoc()
	const end = d.frames - 1
	const ground = makeEl('rect', 0, d.frames, { x: 480, y: 480 }, { w: 960, h: 120, fill: '#52d273' })
	const ball = makeEl('ellipse', 0, d.frames, { x: 120, y: 375 }, { w: 90, h: 90, fill: '#ff4d6d', stroke: '#1a1a1a', strokeWidth: 4 })
	for (let f = 0; f <= end; f += 2) {
		const t = f / end
		setPose(ball, f, { x: 120 + 720 * t, y: 375 - Math.abs(Math.sin(t * Math.PI * 2)) * 260, rotate: 360 * t })
	}
	const title = makeEl('text', 0, d.frames, { x: 480, y: 90 }, { text: 'Boing!', size: 80, bold: true, font: 'round', fill: '#4d7cff', stroke: '#1a1a1a', strokeWidth: 3 })
	for (let f = 0; f <= end; f += 6) setPose(title, f, { rotate: f % 12 ? 5 : -5, scale: f % 12 ? 1.1 : 1 })
	d.els = [ground, ball, title]
	return d
}

export async function start() {
	const $ = <T = HTMLElement>(id: string) => document.getElementById(id) as T
	const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]

	const stage = $('an-stage')
	const svg = $<SVGSVGElement>('an-svg')
	const bgRect = $<SVGRectElement>('an-bg-rect')
	const onionG = $<SVGGElement>('an-onion')
	const elsG = $<SVGGElement>('an-els')
	const draftG = $<SVGGElement>('an-draft')
	const selG = $<SVGGElement>('an-sel')
	const tracks = $('an-tracks')
	const ruler = $('an-ruler')
	const lanes = $('an-lanes')
	const playhead = $('an-playhead')
	const scroller = $('an-scroll')
	const status = $('an-status')

	/* ───────────── state ───────────── */

	let doc: Doc = demo()
	let frame = 0
	let tool: Tool = 'select'
	let selId: string | null = null
	let onion = false
	let playing = false
	const paint = { fill: '#ff4d6d', stroke: '#1a1a1a', strokeWidth: 0 }

	const fromHash = location.hash.length > 1 ? await decodeDoc(location.hash.slice(1)) : null
	if (fromHash) {
		doc = fromHash
		// Keep it before dropping the hash, so a reload doesn't lose it.
		try {
			localStorage.setItem(STORE, JSON.stringify(doc))
		} catch {}
		history.replaceState(null, '', location.pathname)
	} else {
		try {
			doc = readDoc(JSON.parse(localStorage.getItem(STORE) ?? 'null')) ?? doc
		} catch {}
	}

	const selected = () => doc.els.find((e) => e.id === selId) ?? null

	let sayTimer = 0
	function say(text: string, keep = false) {
		status.textContent = text
		clearTimeout(sayTimer)
		if (!keep) sayTimer = window.setTimeout(() => (status.textContent = ''), 4000)
	}

	/* ───────────── undo + saving ───────────── */

	const undos: string[] = []
	let redos: string[] = []
	let marked = false
	let saveTimer = 0

	/**
	 * Undo steps leave images out: they can be megabytes each, and they're never
	 * changed, only added. `load` keeps every image seen this session.
	 */
	const snapshot = () => JSON.stringify({ ...doc, images: {} })

	/** Call before changing the document. One undo step per gesture or edit. */
	function mark() {
		if (marked) return
		undos.push(snapshot())
		if (undos.length > 200) undos.shift()
		redos = []
		marked = true
	}
	/** Call when the gesture or edit ends. */
	function settle() {
		marked = false
		clearTimeout(saveTimer)
		saveTimer = window.setTimeout(keep, 300)
		render()
	}
	/** Keeps the working document in the browser. */
	function keep() {
		clearTimeout(saveTimer)
		saveTimer = 0
		try {
			localStorage.setItem(STORE, JSON.stringify(pruned(doc)))
		} catch {
			say('Too big to keep in this browser. Use Export › Save file.')
		}
	}
	// Don't lose an edit made just before leaving or reloading, or one mid-drag.
	addEventListener('pagehide', keep)
	function load(next: Doc) {
		doc = { ...next, images: { ...doc.images, ...next.images } }
		frame = clamp(frame, 0, doc.frames - 1)
		if (!selected()) selId = null
	}
	function step(from: string[], to: string[]) {
		const s = from.pop()
		if (!s) return
		to.push(snapshot())
		load(JSON.parse(s))
		marked = false
		settle()
	}
	const undo = () => step(undos, redos)
	const redo = () => step(redos, undos)

	/** A one-off change, as one undo step. */
	function edit(fn: () => void) {
		mark()
		fn()
		settle()
	}

	/* ───────────── canvas ───────────── */

	/** Document units per screen pixel. */
	const unit = () => 1 / (svg.getScreenCTM()?.a || 1)

	function toDoc(e: PointerEvent | MouseEvent): Point {
		const m = svg.getScreenCTM()
		if (!m) return [0, 0]
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
		return [p.x, p.y]
	}

	function renderCanvas() {
		const [w, h] = SIZES[doc.size]
		svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
		bgRect.setAttribute('width', String(w))
		bgRect.setAttribute('height', String(h))
		bgRect.setAttribute('fill', doc.bg)
		onionG.innerHTML = onion && !playing ? [frame - 1, frame + 1].filter((f) => f >= 0 && f < doc.frames).map((f) => elementsSvg(doc, f)).join('') : ''
		elsG.innerHTML = elementsSvg(doc, frame, true)
		renderSelection()
	}

	function worldPoint(pose: Pose, [x, y]: Point): Point {
		const r = (pose.rotate * Math.PI) / 180
		const sx = x * pose.scale
		const sy = y * pose.scale
		return [pose.x + sx * Math.cos(r) - sy * Math.sin(r), pose.y + sx * Math.sin(r) + sy * Math.cos(r)]
	}

	function renderSelection() {
		const el = selected()
		const shape = el && elsG.querySelector<SVGGraphicsElement>(`[data-id="${el.id}"] > :last-child`)
		if (!el || !shape || playing) {
			selG.innerHTML = ''
			return
		}
		const b = shape.getBBox()
		const pad = el.kind === 'text' ? 0 : el.strokeWidth / 2
		const pose = poseAt(el, frame, doc.tween)
		const corners: Point[] = [
			[b.x - pad, b.y - pad],
			[b.x + b.width + pad, b.y - pad],
			[b.x + b.width + pad, b.y + b.height + pad],
			[b.x - pad, b.y + b.height + pad],
		]
		const world = corners.map((c) => worldPoint(pose, c))
		const u = unit()
		const top = worldPoint(pose, [b.x + b.width / 2, b.y - pad])
		const r = (pose.rotate * Math.PI) / 180
		const knob: Point = [top[0] + 24 * u * Math.sin(r), top[1] - 24 * u * Math.cos(r)]
		const pts = world.map((p) => p.join(',')).join(' ')
		selG.innerHTML =
			`<polygon class="an-outline" points="${pts}"/>` +
			`<line class="an-outline" x1="${top[0]}" y1="${top[1]}" x2="${knob[0]}" y2="${knob[1]}"/>` +
			`<circle class="an-handle" data-handle="rotate" cx="${knob[0]}" cy="${knob[1]}" r="${6 * u}"/>` +
			`<rect class="an-handle" data-handle="scale" x="${world[2][0] - 5 * u}" y="${world[2][1] - 5 * u}" width="${10 * u}" height="${10 * u}"/>`
	}

	type Drag =
		| { kind: 'move'; el: El; p0: Point; pose: Pose }
		| { kind: 'scale'; el: El; p0: Point; pose: Pose }
		| { kind: 'rotate'; el: El; p0: Point; pose: Pose }
		| { kind: 'draw'; p0: Point; points: Point[] }
	let drag: Drag | null = null

	const strokeFor = () => ({ stroke: paint.stroke, strokeWidth: paint.strokeWidth || 6 })

	svg.addEventListener('pointerdown', (e) => {
		if (e.button !== 0) return
		if (playing) pause()
		const p = toDoc(e)
		const target = e.target as Element
		svg.setPointerCapture(e.pointerId)
		if (tool === 'text') {
			const el = makeEl('text', frame, doc.frames, { x: p[0], y: p[1] }, { text: 'Text', fill: paint.fill === 'none' ? '#1a1a1a' : paint.fill, stroke: paint.stroke, strokeWidth: paint.strokeWidth })
			edit(() => doc.els.push(el))
			selId = el.id
			setTool('select')
			// On pointerup: the mousedown after this would take focus back.
			focusText = true
			return
		}
		if (tool !== 'select') {
			drag = { kind: 'draw', p0: p, points: [p] }
			return
		}
		const handle = target.closest<SVGElement>('[data-handle]')?.dataset.handle
		const el = handle ? selected() : doc.els.find((x) => x.id === target.closest<SVGElement>('#an-els [data-id]')?.dataset.id)
		selId = el?.id ?? null
		if (el) drag = { kind: handle === 'scale' ? 'scale' : handle === 'rotate' ? 'rotate' : 'move', el, p0: p, pose: poseAt(el, frame, doc.tween) }
		render()
	})

	svg.addEventListener('pointermove', (e) => {
		if (!drag) return
		const p = toDoc(e)
		if (drag.kind === 'draw') {
			drag.points.push(p)
			drawDraft(drag, p, e.shiftKey)
			return
		}
		const { el, p0, pose } = drag
		const [cx, cy] = [pose.x, pose.y]
		mark()
		if (drag.kind === 'move') {
			setPose(el, frame, { x: Math.round(pose.x + p[0] - p0[0]), y: Math.round(pose.y + p[1] - p0[1]) }, doc.tween)
		} else if (drag.kind === 'scale') {
			const k = Math.hypot(p[0] - cx, p[1] - cy) / (Math.hypot(p0[0] - cx, p0[1] - cy) || 1)
			setPose(el, frame, { scale: Math.max(0.05, +(pose.scale * k).toFixed(3)) }, doc.tween)
		} else {
			const a = Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(p0[1] - cy, p0[0] - cx)
			let rotate = pose.rotate + (a * 180) / Math.PI
			rotate = e.shiftKey ? Math.round(rotate / 15) * 15 : Math.round(rotate)
			setPose(el, frame, { rotate }, doc.tween)
		}
		renderCanvas()
		renderTimeline()
		renderInspector()
	})

	let focusText = false
	const endDrag = (e: PointerEvent) => {
		if (focusText) {
			focusText = false
			const box = $<HTMLTextAreaElement>('an-text')
			box.focus()
			box.select()
		}
		if (!drag) return
		const d = drag
		drag = null
		if (d.kind === 'draw') {
			draftG.innerHTML = ''
			create(d, toDoc(e), e.shiftKey)
		} else settle()
	}
	svg.addEventListener('pointerup', endDrag)
	svg.addEventListener('pointercancel', endDrag)

	svg.addEventListener('dblclick', (e) => {
		const id = (e.target as Element).closest<SVGElement>('#an-els [data-id]')?.dataset.id
		const el = doc.els.find((x) => x.id === id)
		if (el?.kind === 'text') $<HTMLTextAreaElement>('an-text').focus()
	})

	/** The box from the drag start to the pointer. Shift makes it square. */
	function dragBox([x0, y0]: Point, [x1, y1]: Point, square: boolean) {
		let w = x1 - x0
		let h = y1 - y0
		if (square) {
			const s = Math.max(Math.abs(w), Math.abs(h))
			w = Math.sign(w || 1) * s
			h = Math.sign(h || 1) * s
		}
		return { x: x0 + w / 2, y: y0 + h / 2, w: Math.abs(w), h: Math.abs(h) }
	}

	function drawDraft(d: Extract<Drag, { kind: 'draw' }>, p: Point, shift: boolean) {
		const fill = tool === 'line' || tool === 'pen' ? 'none' : paint.fill
		const { stroke, strokeWidth } = tool === 'line' || tool === 'pen' ? strokeFor() : paint
		const style = `fill="${fill}" stroke="${strokeWidth ? stroke : 'none'}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"`
		if (tool === 'rect' || tool === 'ellipse') {
			const b = dragBox(d.p0, p, shift)
			draftG.innerHTML =
				tool === 'rect'
					? `<rect x="${b.x - b.w / 2}" y="${b.y - b.h / 2}" width="${b.w}" height="${b.h}" ${style}/>`
					: `<ellipse cx="${b.x}" cy="${b.y}" rx="${b.w / 2}" ry="${b.h / 2}" ${style}/>`
		} else if (tool === 'line') {
			draftG.innerHTML = `<path d="M${d.p0.join(' ')}L${p.join(' ')}" ${style}/>`
		} else {
			draftG.innerHTML = `<path d="${pathD(thin(d.points), false)}" ${style}/>`
		}
	}

	function create(d: Extract<Drag, { kind: 'draw' }>, p: Point, shift: boolean) {
		let el: El | null = null
		if (tool === 'rect' || tool === 'ellipse') {
			let b = dragBox(d.p0, p, shift)
			// A click without a drag still makes something.
			if (b.w < 4 && b.h < 4) b = { x: p[0], y: p[1], w: 120, h: 120 }
			el = makeEl(tool, frame, doc.frames, { x: Math.round(b.x), y: Math.round(b.y) }, { w: Math.round(b.w), h: Math.round(b.h), ...paint })
		} else if (tool === 'line') {
			const end: Point = Math.hypot(p[0] - d.p0[0], p[1] - d.p0[1]) < 4 ? [d.p0[0] + 160, d.p0[1]] : p
			const c = centre([d.p0, end])
			el = makeEl('line', frame, doc.frames, { x: Math.round(c.cx), y: Math.round(c.cy) }, { points: c.points, fill: 'none', ...strokeFor() })
		} else if (tool === 'pen') {
			const pts = thin(d.points)
			if (pts.length < 2) return
			const c = centre(pts)
			const points = c.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as Point)
			el = makeEl('path', frame, doc.frames, { x: Math.round(c.cx), y: Math.round(c.cy) }, { points, fill: 'none', ...strokeFor() })
		}
		if (!el) return
		const made = el
		edit(() => doc.els.push(made))
		selId = made.id
		if (tool !== 'pen') setTool('select')
		else render()
	}

	/* ───────────── toolbar ───────────── */

	const toolBtns = $$<HTMLButtonElement>('[data-tool]')
	function setTool(t: Tool) {
		tool = t
		stage.dataset.tool = t
		for (const b of toolBtns) b.ariaPressed = String(b.dataset.tool === t)
		render()
	}
	for (const b of toolBtns) b.onclick = () => setTool(b.dataset.tool as Tool)

	const fillIn = $<HTMLInputElement>('an-fill')
	const strokeIn = $<HTMLInputElement>('an-stroke')
	const widthIn = $<HTMLInputElement>('an-stroke-width')
	const noFill = $<HTMLButtonElement>('an-nofill')
	let lastFill = paint.fill

	/** Paint edits go to the selection, or to the next shape when nothing is selected. */
	function setPaint(change: Partial<typeof paint>) {
		const el = selected()
		// The default paint isn't part of the document, so it has no undo step.
		if (el) mark()
		Object.assign(el ?? paint, change)
		renderCanvas()
		renderBar()
	}
	fillIn.oninput = () => {
		lastFill = fillIn.value
		setPaint({ fill: fillIn.value })
	}
	strokeIn.oninput = () => setPaint({ stroke: strokeIn.value })
	widthIn.oninput = () => {
		const v = clamp(Math.round(+widthIn.value) || 0, 0, 80)
		setPaint({ strokeWidth: v })
	}
	for (const i of [fillIn, strokeIn, widthIn]) i.onchange = settle
	noFill.onclick = () => {
		const cur = (selected() ?? paint).fill
		setPaint({ fill: cur === 'none' ? lastFill : 'none' })
		settle()
	}

	$('an-undo').onclick = undo
	$('an-redo').onclick = redo

	for (const item of $$('[data-size]')) {
		item.onclick = () => edit(() => (doc.size = item.dataset.size as Size))
	}
	const bgIn = $<HTMLInputElement>('an-bg')
	bgIn.oninput = () => {
		mark()
		doc.bg = bgIn.value
		renderCanvas()
	}
	bgIn.onchange = settle
	$('an-new').onclick = () => {
		if (doc.els.length && !confirm('Start a new animation? You can undo this.')) return
		edit(() => load({ ...newDoc(), size: doc.size, fps: doc.fps, frames: doc.frames, loop: doc.loop }))
		frame = 0
		setName('')
		render()
		renderSaves()
	}
	$('an-demo').onclick = () => {
		edit(() => load(demo()))
		frame = 0
		render()
	}

	function renderBar() {
		const src = selected() ?? paint
		const kind = src === paint ? null : (src as El).kind
		const lineish = kind === 'line' || kind === 'image'
		if (src.fill !== 'none') fillIn.value = src.fill
		fillIn.closest('label')!.toggleAttribute('data-none', src.fill === 'none' || lineish)
		noFill.ariaPressed = String(src.fill === 'none')
		noFill.disabled = fillIn.disabled = lineish
		// Images have no paint.
		strokeIn.disabled = widthIn.disabled = kind === 'image'
		strokeIn.value = src.stroke
		strokeIn.closest('label')!.toggleAttribute('data-none', src.strokeWidth === 0 || kind === 'image')
		if (document.activeElement !== widthIn) widthIn.value = String(src.strokeWidth)
		bgIn.value = doc.bg
		for (const item of $$('[data-size]')) item.toggleAttribute('data-current', item.dataset.size === doc.size)
		$<HTMLButtonElement>('an-undo').disabled = !undos.length
		$<HTMLButtonElement>('an-redo').disabled = !redos.length
	}

	/* ───────────── inspector ───────────── */

	const poseIns = $$<HTMLInputElement>('[data-pose]')
	const nameOf = (el: El) => {
		if (el.kind === 'text') return el.text.split('\n')[0].trim() || 'Text'
		return `${NAME[el.kind]} ${doc.els.filter((x) => x.kind === el.kind).indexOf(el) + 1}`
	}
	const showPose = (k: keyof Pose, v: number) => String(k === 'scale' || k === 'opacity' ? Math.round(v * 100) : Math.round(v))

	/** Sets an input's value unless someone is typing in it. */
	const put = (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) => {
		if (document.activeElement !== input) input.value = v
	}

	function renderInspector() {
		const el = selected()
		$('an-empty').hidden = Boolean(el)
		$('an-props').hidden = !el
		if (!el) return
		$('an-el-name').innerHTML = `<i class="ph ${ICON[el.kind]}"></i> ${esc(nameOf(el))}`
		const pose = poseAt(el, frame, doc.tween)
		for (const input of poseIns) put(input, showPose(input.dataset.pose as keyof Pose, pose[input.dataset.pose as keyof Pose]))

		const keys = keyFrames(el)
		const here = frame in el.keys
		const set = poseIns[0].closest('fieldset')!
		set.toggleAttribute('data-key', here)
		const before = keys.filter((k) => k < frame).pop()
		const after = keys.find((k) => k > frame)
		$('an-key-state').textContent = here
			? `Key on frame ${frame + 1}`
			: before === undefined
				? `Before the first key (${keys[0] + 1})`
				: doc.tween && after !== undefined
					? `Easing ${before + 1} → ${after + 1}`
					: `Holding frame ${before + 1}`
		const keyBtn = $<HTMLButtonElement>('an-key')
		keyBtn.querySelector('span')!.textContent = here ? 'Remove key' : 'Add key'
		keyBtn.disabled = here && keys.length === 1
		$<HTMLButtonElement>('an-clear-keys').disabled = keys.length === 1

		put($<HTMLInputElement>('an-from'), String(el.from + 1))
		put($<HTMLInputElement>('an-to'), String(el.to + 1))
		for (const id of ['an-from', 'an-to']) $<HTMLInputElement>(id).max = String(doc.frames)

		$('an-box-set').hidden = el.kind !== 'rect' && el.kind !== 'ellipse' && el.kind !== 'image'
		$('an-image-set').hidden = el.kind !== 'image'
		put($<HTMLInputElement>('an-w'), String(Math.round(el.w)))
		put($<HTMLInputElement>('an-h'), String(Math.round(el.h)))
		$('an-path-set').hidden = el.kind !== 'path'
		$<HTMLInputElement>('an-closed').checked = el.closed
		$('an-text-set').hidden = el.kind !== 'text'
		put($<HTMLTextAreaElement>('an-text'), el.text)
		put($<HTMLSelectElement>('an-font'), el.font)
		put($<HTMLInputElement>('an-size'), String(el.size))
		$<HTMLInputElement>('an-bold').checked = el.bold
		const i = doc.els.indexOf(el)
		$<HTMLButtonElement>('an-raise').disabled = i === doc.els.length - 1
		$<HTMLButtonElement>('an-lower').disabled = i === 0
	}

	/** Wires an inspector input to the selection: live while typing, one undo step per edit. */
	function field<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id: string | T, apply: (el: El, input: T) => void) {
		const input = typeof id === 'string' ? $<T>(id) : id
		const run = () => {
			const el = selected()
			if (!el) return
			mark()
			apply(el, input)
			renderCanvas()
			renderTimeline()
			renderInspector()
			renderBar()
		}
		input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', run)
		input.addEventListener('change', () => {
			// Show the cleaned-up value once typing is done.
			input.blur()
			settle()
		})
	}

	const num = (input: HTMLInputElement) => (input.value.trim() === '' ? NaN : +input.value)
	for (const input of poseIns) {
		field(input, (el, i) => {
			const k = i.dataset.pose as keyof Pose
			let v = num(i)
			if (Number.isNaN(v)) return
			if (k === 'scale') v = Math.max(1, v) / 100
			if (k === 'opacity') v = clamp(v, 0, 100) / 100
			setPose(el, frame, { [k]: v }, doc.tween)
		})
	}
	field<HTMLInputElement>('an-from', (el, i) => {
		const v = num(i)
		if (!Number.isNaN(v)) el.from = clamp(Math.round(v) - 1, 0, el.to)
	})
	field<HTMLInputElement>('an-to', (el, i) => {
		const v = num(i)
		if (!Number.isNaN(v)) el.to = clamp(Math.round(v) - 1, el.from, doc.frames - 1)
	})
	// Images keep their shape.
	field<HTMLInputElement>('an-w', (el, i) => {
		const v = num(i)
		if (!(v > 0)) return
		if (el.kind === 'image') el.h *= v / el.w
		el.w = v
	})
	field<HTMLInputElement>('an-h', (el, i) => {
		const v = num(i)
		if (!(v > 0)) return
		if (el.kind === 'image') el.w *= v / el.h
		el.h = v
	})
	field<HTMLInputElement>('an-closed', (el, i) => {
		el.closed = i.checked
		if (el.closed && el.fill === 'none') el.fill = lastFill
	})
	field<HTMLTextAreaElement>('an-text', (el, i) => (el.text = i.value))
	field<HTMLSelectElement>('an-font', (el, i) => (el.font = i.value as Font))
	field<HTMLInputElement>('an-size', (el, i) => {
		const v = num(i)
		if (v >= 4) el.size = Math.min(400, v)
	})
	field<HTMLInputElement>('an-bold', (el, i) => (el.bold = i.checked))

	const withSel = (fn: (el: El) => void) => () => {
		const el = selected()
		if (el) edit(() => fn(el))
	}
	const toggleKey = withSel((el) => (frame in el.keys ? removeKey(el, frame) : setPose(el, frame, {}, doc.tween)))
	$('an-key').onclick = toggleKey
	$('an-clear-keys').onclick = withSel((el) => (el.keys = { [frame]: poseAt(el, frame, doc.tween) }))
	$('an-from-here').onclick = withSel((el) => {
		el.from = frame
		el.to = Math.max(el.to, frame)
	})
	$('an-to-here').onclick = withSel((el) => {
		el.to = frame
		el.from = Math.min(el.from, frame)
	})
	$('an-all-frames').onclick = withSel((el) => {
		el.from = 0
		el.to = doc.frames - 1
	})
	const shift = (by: number) =>
		withSel((el) => {
			const i = doc.els.indexOf(el)
			const j = clamp(i + by, 0, doc.els.length - 1)
			;[doc.els[i], doc.els[j]] = [doc.els[j], doc.els[i]]
		})
	$('an-raise').onclick = shift(1)
	$('an-lower').onclick = shift(-1)
	const remove = withSel((el) => {
		doc.els = doc.els.filter((x) => x !== el)
		selId = null
	})
	$('an-delete').onclick = remove
	$('an-as-bg').onclick = withSel((el) => {
		// Covers the canvas on every frame, behind everything else.
		const [cw, ch] = SIZES[doc.size]
		const k = Math.max(cw / el.w, ch / el.h)
		el.w *= k
		el.h *= k
		el.keys = { 0: { x: cw / 2, y: ch / 2, rotate: 0, scale: 1, opacity: 1 } }
		el.from = 0
		el.to = doc.frames - 1
		doc.els = [el, ...doc.els.filter((x) => x !== el)]
	})
	const duplicate = withSel((el) => {
		const copy: El = structuredClone(el)
		copy.id = uid()
		for (const p of Object.values(copy.keys)) {
			p.x += 20
			p.y += 20
		}
		doc.els.splice(doc.els.indexOf(el) + 1, 0, copy)
		selId = copy.id
	})
	$('an-dupe').onclick = duplicate

	/* ───────────── timeline ───────────── */

	const fpsIn = $<HTMLInputElement>('an-fps')
	const framesIn = $<HTMLInputElement>('an-frames')

	let lastTimeline = ''
	function renderTimeline() {
		const ticks = Array.from({ length: doc.frames }, (_, f) => f)
			.filter((f) => f === 0 || (f + 1) % 5 === 0)
			.map((f) => `<span class="an-tick" style="left: calc(var(--fw) * ${f})">${f + 1}</span>`)
			.join('')
		const lanesHtml = [...doc.els]
			.reverse()
			.map((el) => {
				const span = `<span class="an-span" style="left: calc(var(--fw) * ${el.from}); width: calc(var(--fw) * ${el.to - el.from + 1})"></span>`
				const keys = keyFrames(el)
					.filter((f) => f < doc.frames)
					.map((f) => `<span class="an-key" data-frame="${f}" style="left: calc(var(--fw) * ${f})" title="Key on frame ${f + 1}"></span>`)
					.join('')
				return `<div class="an-track"${el.id === selId ? ' data-selected' : ''}><button type="button" class="an-label" data-id="${el.id}"><i class="ph ${ICON[el.kind]}"></i> ${esc(nameOf(el))}</button><div class="an-lane" data-id="${el.id}">${span}${keys}</div></div>`
			})
			.join('')
		const html = `${doc.frames}|${ticks}|${lanesHtml}`
		if (html !== lastTimeline) {
			lastTimeline = html
			tracks.style.setProperty('--frames', String(doc.frames))
			ruler.innerHTML = `<span class="an-label">Frame</span><div class="an-lane">${ticks}</div>`
			lanes.innerHTML = lanesHtml
		}
		playhead.style.left = `calc(var(--label) + var(--fw) * ${frame})`
		$('an-frame-out').textContent = `${frame + 1} / ${doc.frames}`
		$('an-length').textContent = `${(doc.frames / doc.fps).toFixed(2)}s`
		put(fpsIn, String(doc.fps))
		put(framesIn, String(doc.frames))
		$('an-loop').ariaPressed = String(doc.loop)
		$('an-tween').ariaPressed = String(doc.tween)
		$('an-onion-btn').ariaPressed = String(onion)
	}

	/** Keeps the playhead in view while playing or stepping. */
	function followPlayhead() {
		const lane = ruler.querySelector<HTMLElement>('.an-lane')
		const label = ruler.querySelector<HTMLElement>('.an-label')
		if (!lane || !label) return
		const fw = lane.offsetWidth / doc.frames
		const x = label.offsetWidth + frame * fw
		const view = scroller.scrollLeft + label.offsetWidth
		if (x < view || x + fw > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = x - label.offsetWidth - fw * 2
	}

	function frameAt(e: PointerEvent) {
		const lane = ruler.querySelector<HTMLElement>('.an-lane')!.getBoundingClientRect()
		return clamp(Math.floor(((e.clientX - lane.left) / lane.width) * doc.frames), 0, doc.frames - 1)
	}

	type TDrag = { kind: 'scrub' } | { kind: 'key'; el: El; at: number }
	let tdrag: TDrag | null = null
	tracks.addEventListener('pointerdown', (e) => {
		if (e.button !== 0) return
		const t = e.target as HTMLElement
		const id = t.closest<HTMLElement>('[data-id]')?.dataset.id
		if (id) selId = id
		if (t.classList.contains('an-label')) {
			render()
			return
		}
		if (!t.closest('.an-lane')) return
		if (playing) pause()
		tracks.setPointerCapture(e.pointerId)
		const el = selected()
		if (t.classList.contains('an-key') && el) {
			tdrag = { kind: 'key', el, at: +t.dataset.frame! }
			setFrame(tdrag.at)
		} else {
			tdrag = { kind: 'scrub' }
			setFrame(frameAt(e))
		}
	})
	tracks.addEventListener('pointermove', (e) => {
		if (!tdrag) return
		const f = frameAt(e)
		if (tdrag.kind === 'key' && f !== tdrag.at && !(f in tdrag.el.keys)) {
			mark()
			moveKey(tdrag.el, tdrag.at, f)
			tdrag.at = f
		}
		setFrame(f)
	})
	const endT = () => {
		if (tdrag?.kind === 'key') settle()
		tdrag = null
	}
	tracks.addEventListener('pointerup', endT)
	tracks.addEventListener('pointercancel', endT)

	function setFrame(f: number) {
		frame = clamp(f, 0, doc.frames - 1)
		render()
		followPlayhead()
	}
	$('an-first').onclick = () => setFrame(0)
	$('an-prev').onclick = () => setFrame(frame - 1)
	$('an-next').onclick = () => setFrame(frame + 1)

	fpsIn.onchange = () => {
		const v = Math.round(+fpsIn.value)
		fpsIn.blur()
		if (v) edit(() => (doc.fps = clamp(v, 1, MAX_FPS)))
		else render()
	}
	framesIn.onchange = () => {
		const v = clamp(Math.round(+framesIn.value) || doc.frames, 1, MAX_FRAMES)
		framesIn.blur()
		edit(() => {
			const end = doc.frames - 1
			doc.frames = v
			for (const el of doc.els) {
				// Shapes that ran to the end still do.
				el.to = el.to >= end ? v - 1 : Math.min(el.to, v - 1)
				el.from = Math.min(el.from, el.to)
				// Drop keys past the end, so growing the animation again doesn't bring them back.
				const last = poseAt(el, v - 1, doc.tween)
				for (const f of keyFrames(el)) if (f >= v) delete el.keys[f]
				if (!keyFrames(el).length) el.keys[v - 1] = last
			}
			frame = Math.min(frame, v - 1)
		})
	}
	$('an-loop').onclick = () => edit(() => (doc.loop = !doc.loop))
	$('an-tween').onclick = () => edit(() => (doc.tween = !doc.tween))
	$('an-onion-btn').onclick = () => {
		onion = !onion
		render()
	}

	/* ───────────── playback ───────────── */

	const playBtn = $<HTMLButtonElement>('an-play')
	let raf = 0
	let last = 0
	let acc = 0
	function tick(t: number) {
		acc += t - last
		last = t
		const frameMs = 1000 / doc.fps
		while (acc >= frameMs && playing) {
			acc -= frameMs
			if (frame + 1 < doc.frames) frame++
			else if (doc.loop) frame = 0
			else pause()
		}
		render()
		followPlayhead()
		if (playing) raf = requestAnimationFrame(tick)
	}
	function play() {
		if (!doc.loop && frame >= doc.frames - 1) frame = 0
		playing = true
		last = performance.now()
		acc = 0
		raf = requestAnimationFrame(tick)
		renderPlay()
	}
	function pause() {
		playing = false
		cancelAnimationFrame(raf)
		renderPlay()
		render()
	}
	function renderPlay() {
		playBtn.querySelector('i')!.className = `ph ${playing ? 'ph-pause' : 'ph-play'}`
		playBtn.querySelector('span')!.textContent = playing ? 'Pause' : 'Play'
	}
	const togglePlay = () => (playing ? pause() : play())
	playBtn.onclick = togglePlay

	/* ───────────── export ───────────── */

	function download(blob: Blob, ext: string) {
		const a = document.createElement('a')
		a.href = URL.createObjectURL(blob)
		a.download = `animation.${ext}`
		a.click()
		setTimeout(() => URL.revokeObjectURL(a.href), 1000)
	}

	const cancelBtn = $<HTMLButtonElement>('an-cancel')
	let cancelled = false
	cancelBtn.onclick = () => (cancelled = true)
	let exporting = false

	const exporters: Record<string, () => Promise<void> | void> = {
		async video() {
			if (exporting) return
			exporting = true
			cancelled = false
			cancelBtn.hidden = false
			if (playing) pause()
			try {
				const out = await video(structuredClone(doc), (t) => say(`Making video… ${Math.round(t * 100)}%`, true), () => cancelled)
				if (out instanceof Blob) {
					download(out, out.type === 'video/mp4' ? 'mp4' : 'webm')
					say(doc.loop ? 'Saved. The video repeats the loop to fill a few seconds.' : 'Saved')
				} else say(out ?? 'Video cancelled')
			} catch {
				say("Couldn't make the video")
			} finally {
				exporting = false
				cancelBtn.hidden = true
			}
		},
		async png() {
			download(await png(doc, frame), 'png')
		},
		svg() {
			download(svgFile(doc, frame), 'svg')
		},
		async link() {
			const out = pruned(doc)
			// Opening a link refuses anything bigger, so don't hand one out.
			if (new TextEncoder().encode(JSON.stringify(out)).length > MAX_DOC_BYTES) {
				say('Too big for a link. Use Save file instead.')
				return
			}
			const url = `${location.origin}${location.pathname}#${await encodeDoc(out)}`
			try {
				await navigator.clipboard.writeText(url)
				say(
					Object.keys(out.images).length
						? 'Link copied. Images make it very long, so Save file is safer for sharing.'
						: url.length > 8000
							? 'Link copied. It is long, so some apps may cut it short.'
							: 'Link copied',
				)
			} catch {
				say("Couldn't copy the link")
			}
		},
		json() {
			download(new Blob([JSON.stringify(pruned(doc))], { type: 'application/json' }), 'json')
		},
		open() {
			$('an-file').click()
		},
	}
	for (const item of $$('[data-export]')) item.onclick = () => exporters[item.dataset.export!]()
	const fileIn = $<HTMLInputElement>('an-file')
	fileIn.onchange = async () => {
		const file = fileIn.files?.[0]
		fileIn.value = ''
		if (!file) return
		try {
			const next = readDoc(JSON.parse(await file.text()))
			if (!next) throw new Error('bad file')
			edit(() => load(next))
			say(`Opened ${file.name}`)
		} catch {
			say("That file isn't an animation")
		}
	}

	/* ───────────── images ───────────── */

	/** Adds an image file as a new element, scaled down to fit the canvas. */
	async function addImage(file: Blob, at?: Point) {
		const url = URL.createObjectURL(file)
		const img = new Image()
		img.src = url
		try {
			await img.decode()
		} catch {
			say("Couldn't read that image")
			return
		} finally {
			URL.revokeObjectURL(url)
		}
		// Re-encode: smaller to store, and the same safe format whatever was pasted.
		const k = Math.min(1, MAX_IMAGE / Math.max(img.naturalWidth, img.naturalHeight))
		const canvas = document.createElement('canvas')
		canvas.width = Math.max(1, Math.round(img.naturalWidth * k))
		canvas.height = Math.max(1, Math.round(img.naturalHeight * k))
		canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
		const data = canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', 0.85)
		const [cw, ch] = SIZES[doc.size]
		const fit = Math.min(1, (cw * 0.8) / canvas.width, (ch * 0.8) / canvas.height)
		const [x, y] = at ?? [cw / 2, ch / 2]
		const id = uid()
		const el = makeEl('image', frame, doc.frames, { x: Math.round(x), y: Math.round(y) }, { w: Math.round(canvas.width * fit), h: Math.round(canvas.height * fit), src: id, strokeWidth: 0 })
		edit(() => {
			doc.images[id] = data
			doc.els.push(el)
		})
		selId = el.id
		setTool('select')
	}

	const imageFiles = (list?: FileList | null) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'))

	document.addEventListener('paste', (e) => {
		if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return
		const files = imageFiles(e.clipboardData?.files)
		if (!files.length) return
		e.preventDefault()
		for (const f of files) addImage(f)
	})
	stage.addEventListener('dragover', (e) => {
		if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
	})
	stage.addEventListener('drop', (e) => {
		const files = imageFiles(e.dataTransfer?.files)
		if (!files.length) return
		e.preventDefault()
		const p = toDoc(e)
		for (const f of files) addImage(f, p)
	})
	const imageIn = $<HTMLInputElement>('an-image-file')
	$('an-image-btn').onclick = () => imageIn.click()
	imageIn.onchange = () => {
		for (const f of imageFiles(imageIn.files)) addImage(f)
		imageIn.value = ''
	}

	/* ───────────── saved animations ───────────── */

	type Saved = { name: string; doc: Doc; at: number }
	const SAVES = 'animator:saved'
	const NAME_KEY = 'animator:name'
	const nameIn = $<HTMLInputElement>('an-name')
	const saves = $<HTMLUListElement>('an-saves')
	try {
		nameIn.value = localStorage.getItem(NAME_KEY) ?? ''
	} catch {}

	function loadSaves(): Saved[] {
		try {
			const list = JSON.parse(localStorage.getItem(SAVES) ?? '[]')
			if (!Array.isArray(list)) return []
			return list.flatMap((x) => {
				const d = typeof x?.name === 'string' ? readDoc(x.doc) : null
				return d ? [{ name: x.name, doc: d, at: Number(x.at) || 0 }] : []
			})
		} catch {
			return []
		}
	}

	function storeSaves(list: Saved[]) {
		try {
			localStorage.setItem(SAVES, JSON.stringify(list))
			return true
		} catch {
			say('Too big to save in this browser. Use Export › Save file.')
			return false
		}
	}

	function renderSaves() {
		const current = nameIn.value.trim()
		saves.replaceChildren(
			...loadSaves().map((x) => {
				const li = document.createElement('li')
				const open = document.createElement('button')
				open.type = 'button'
				open.className = 'zui-button zui-button-variant-ghost an-save-item'
				if (x.name === current) open.ariaCurrent = 'true'
				open.innerHTML = '<img alt=""><span></span><small></small>'
				open.querySelector('img')!.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(frameSvg(x.doc, 0))}`
				open.querySelector('span')!.textContent = x.name
				open.querySelector('small')!.textContent = `${x.doc.frames} frames · ${new Date(x.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
				open.onclick = () => openSave(x)
				const del = document.createElement('button')
				del.type = 'button'
				del.className = 'zui-button zui-button-variant-ghost zui-button-icon zui-button-size-sm'
				del.ariaLabel = `Delete ${x.name}`
				del.innerHTML = '<i class="ph ph-trash"></i>'
				del.onclick = () => {
					if (!confirm(`Delete "${x.name}"?`)) return
					if (storeSaves(loadSaves().filter((y) => y.name !== x.name))) renderSaves()
				}
				li.append(open, del)
				return li
			}),
		)
	}

	function setName(name: string) {
		nameIn.value = name
		try {
			localStorage.setItem(NAME_KEY, name)
		} catch {}
	}

	function openSave(x: Saved) {
		if (playing) pause()
		edit(() => load(structuredClone(x.doc)))
		frame = 0
		selId = null
		setName(x.name)
		render()
		renderSaves()
		say(`Opened "${x.name}"`)
	}

	$<HTMLFormElement>('an-save').onsubmit = (e) => {
		e.preventDefault()
		const list = loadSaves()
		// A generated name must not replace an existing save.
		let n = list.length + 1
		while (list.some((y) => y.name === `Animation ${n}`)) n++
		const name = nameIn.value.trim() || `Animation ${n}`
		setName(name)
		if (storeSaves([{ name, doc: pruned(doc), at: Date.now() }, ...list.filter((y) => y.name !== name)])) {
			say(`Saved "${name}"`)
			renderSaves()
		}
	}
	// Typing only moves the highlight; the list (and its thumbnails) stays.
	nameIn.oninput = () => {
		const current = nameIn.value.trim()
		for (const item of saves.querySelectorAll<HTMLButtonElement>('.an-save-item')) {
			if (item.querySelector('span')?.textContent === current) item.ariaCurrent = 'true'
			else item.removeAttribute('aria-current')
		}
	}

	/* ───────────── keyboard ───────────── */

	document.addEventListener('keydown', (e) => {
		const t = e.target as HTMLElement
		if (t.closest('input, textarea, select, [contenteditable]')) return
		const mod = e.metaKey || e.ctrlKey
		const key = e.key.toLowerCase()
		if (mod && key === 'z') {
			e.preventDefault()
			if (e.shiftKey) redo()
			else undo()
			return
		}
		if (mod && key === 'y') {
			e.preventDefault()
			redo()
			return
		}
		if (mod && key === 'd') {
			e.preventDefault()
			duplicate()
			return
		}
		if (mod || e.altKey) return
		if (key === ' ') {
			e.preventDefault()
			togglePlay()
		} else if (key === ',') setFrame(frame - 1)
		else if (key === '.') setFrame(frame + 1)
		else if (key === 'home') setFrame(0)
		else if (key === 'end') setFrame(doc.frames - 1)
		else if (key === 'escape') {
			selId = null
			render()
		} else if (key === 'delete' || key === 'backspace') {
			if (selected()) {
				e.preventDefault()
				remove()
			}
		} else if (key === 'k') toggleKey()
		else if (key.startsWith('arrow')) {
			const el = selected()
			const d = e.shiftKey ? 10 : 1
			const nudge: Record<string, Point> = { arrowleft: [-d, 0], arrowright: [d, 0], arrowup: [0, -d], arrowdown: [0, d] }
			const [dx, dy] = nudge[key] ?? [0, 0]
			if (!el) {
				if (dx) setFrame(frame + Math.sign(dx))
				return
			}
			e.preventDefault()
			const p = poseAt(el, frame, doc.tween)
			edit(() => setPose(el, frame, { x: p.x + dx, y: p.y + dy }, doc.tween))
		} else if (key in TOOL_KEYS) setTool(TOOL_KEYS[key])
	})

	/* ───────────── go ───────────── */

	function render() {
		renderCanvas()
		renderTimeline()
		renderInspector()
		renderBar()
	}

	renderSaves()

	// The selection handles are sized in screen pixels.
	new ResizeObserver(() => renderSelection()).observe(stage)
	setTool('select')
}
