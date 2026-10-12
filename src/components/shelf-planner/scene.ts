/**
 * Three.js view of the room. Owns the renderer, a hand-rolled orbit
 * (drag to rotate, pinch or wheel to zoom) and tap-to-pick on shelves.
 * Colours come from ZUI tokens on the container so it follows the theme.
 */
import * as THREE from 'three'
import { BRACKET_END, HEAD, type Plan, TYPES, battenPieces, boards, bracketsFor, clearances, frontAngle, frontSlope, frontZ, openWidth } from './model'

export type Fixings = 'none' | 'battens' | 'brackets' | 'mix'
export type View = 'front' | 'top' | 'side'
/** A figure under the 3D view that the model is showing. */
export type Highlight = 'walk' | 'depth' | 'run' | null

const VIEWS: Record<View, [number, number, number]> = {
	front: [0.42, 1.2, 560],
	top: [0.001, 0.06, 520],
	side: [Math.PI / 2, 1.5, 600],
}

export class ShelfScene {
	private renderer: THREE.WebGLRenderer
	private scene = new THREE.Scene()
	private camera = new THREE.PerspectiveCamera(42, 1, 1, 4000)
	private roomGroup = new THREE.Group()
	private shelfGroup = new THREE.Group()
	private hlGroup = new THREE.Group()
	private fixGroup = new THREE.Group()
	private showFixings: Fixings = 'none'
	private highlight: Highlight = null
	private pickables: THREE.Mesh[] = []
	private target = new THREE.Vector3()
	private th = VIEWS.front[0]
	private ph = VIEWS.front[1]
	private rad = VIEWS.front[2]
	private plan: Plan | null = null
	private selected = -1
	private pointers = new Map<number, [number, number]>()
	private pinch = 0
	private moved = 0
	private resizeObserver: ResizeObserver
	private cleanups: (() => void)[] = []

	constructor(
		private el: HTMLElement,
		private onPick: (level: number) => void,
	) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
		this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
		const canvas = this.renderer.domElement
		// The model is pointer-only; everything it shows is also in the levels list and cut list.
		canvas.setAttribute('role', 'img')
		canvas.setAttribute('aria-label', 'Rotatable 3D model of the room and its shelves. Every shelf is also listed in the levels and cut list.')
		el.appendChild(canvas)
		this.scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI))
		const light = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI)
		light.position.set(220, 420, 320)
		this.scene.add(light, this.roomGroup, this.shelfGroup, this.hlGroup, this.fixGroup)
		this.bindPointer()
		this.resizeObserver = new ResizeObserver(() => this.resize())
		this.resizeObserver.observe(el)
		const mq = matchMedia('(prefers-color-scheme: dark)')
		const retheme = () => this.plan && this.setPlan(this.plan, this.selected, true)
		mq.addEventListener('change', retheme)
		const mo = new MutationObserver(retheme)
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
		this.cleanups.push(() => mq.removeEventListener('change', retheme), () => mo.disconnect())
	}

	private probe?: HTMLSpanElement
	private paint?: CanvasRenderingContext2D | null

	/**
	 * ZUI tokens are oklch() and light-dark(), which THREE.Color can't parse.
	 * Resolve the token on a hidden element, then let a 1px canvas turn it into sRGB.
	 */
	private css(name: string) {
		if (!this.probe) {
			this.probe = document.createElement('span')
			this.probe.style.display = 'none'
			this.el.appendChild(this.probe)
			this.paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
		}
		this.probe.style.color = `var(${name})`
		const resolved = getComputedStyle(this.probe).color
		const ctx = this.paint
		if (!ctx) return new THREE.Color(0x888888)
		ctx.clearRect(0, 0, 1, 1)
		ctx.fillStyle = '#888888'
		ctx.fillStyle = resolved
		ctx.fillRect(0, 0, 1, 1)
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
		return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
	}

	setPlan(plan: Plan, selected: number, rebuildRoom = true) {
		const roomChanged = rebuildRoom || !this.plan || JSON.stringify(plan.room) !== JSON.stringify(this.plan.room)
		this.plan = plan
		this.selected = selected
		if (roomChanged) {
			this.target.set(plan.room.w / 2, plan.room.h * 0.48, plan.room.dl / 2)
			this.buildRoom()
		}
		this.buildShelves()
		this.update()
	}

	setSelected(i: number) {
		this.selected = i
		this.applyHighlight()
		this.draw()
	}

	/** Light up what a figure measures and fade the shelves it doesn't count. */
	setHighlight(h: Highlight) {
		this.highlight = h
		this.applyHighlight()
		this.draw()
	}

	/** Show the battens or the brackets that hold the shelves up. */
	setFixings(mode: Fixings) {
		this.showFixings = mode
		this.buildFixings()
		this.draw()
	}

	setView(v: View) {
		;[this.th, this.ph, this.rad] = VIEWS[v]
		this.update()
	}

	/** PNG of the doorway view, for the PDF. Restores the current camera afterwards. */
	snapshot() {
		const prev: [number, number, number] = [this.th, this.ph, this.rad]
		this.setView('front')
		const url = this.renderer.domElement.toDataURL('image/png')
		const { width, height } = this.renderer.domElement
		;[this.th, this.ph, this.rad] = prev
		this.update()
		return { url, ratio: height / width }
	}

	dispose() {
		this.resizeObserver.disconnect()
		for (const c of this.cleanups) c()
		this.clear(this.roomGroup)
		this.clear(this.shelfGroup)
		this.clear(this.hlGroup)
		this.clear(this.fixGroup)
		this.renderer.dispose()
		this.renderer.domElement.remove()
		this.probe?.remove()
	}

	private clear(g: THREE.Group) {
		for (const c of [...g.children]) {
			g.remove(c)
			const m = c as THREE.Mesh
			m.geometry?.dispose()
			const mat = m.material as THREE.Material | undefined
			mat?.dispose()
		}
	}

	private buildRoom() {
		const r = this.plan!.room
		this.clear(this.roomGroup)
		const lineMat = new THREE.LineBasicMaterial({ color: this.css('--color-muted') })
		const line = (pts: [number, number, number][]) =>
			this.roomGroup.add(
				new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))), lineMat),
			)
		const floor: [number, number][] = [
			[0, 0],
			[r.w, 0],
			[r.w, r.dr],
			[r.w - r.retR, r.dr],
			[r.ret, r.dl],
			[0, r.dl],
			[0, 0],
		]
		line(floor.map(([x, z]) => [x, 0, z]))
		line(floor.map(([x, z]) => [x, r.h, z]))
		for (const [x, z] of floor.slice(0, 6)) line([[x, 0, z], [x, r.h, z]])
		const mx = r.ret + openWidth(r) / 2
		line([[r.ret, r.door, r.dl], [r.w - r.retR, r.door, r.dr]])
		line([[mx, 0, frontZ(r, mx)], [mx, r.door, frontZ(r, mx)]])

		const wall = this.css('--color-border')
		const thin = new THREE.MeshLambertMaterial({ color: wall, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
		const solid = new THREE.MeshLambertMaterial({ color: wall, transparent: true, opacity: 0.6 })
		const plane = (w: number, h: number, pos: [number, number, number], ry = 0, rx = 0) => {
			const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), thin)
			m.position.set(...pos)
			m.rotation.set(rx, ry, 0)
			this.roomGroup.add(m)
		}
		const block = (w: number, d: number, pos: [number, number, number]) => {
			const m = new THREE.Mesh(new THREE.BoxGeometry(w, r.h, d), solid)
			m.position.set(...pos)
			this.roomGroup.add(m)
		}
		plane(r.w, r.h, [r.w / 2, r.h / 2, 0])
		plane(r.dl, r.h, [0, r.h / 2, r.dl / 2], Math.PI / 2)
		plane(r.dr, r.h, [r.w, r.h / 2, r.dr / 2], Math.PI / 2)
		// Floor follows the real footprint, angled front and returns included. Shape y is -z once rotated flat.
		const shape = new THREE.Shape(floor.slice(0, 6).map(([x, z]) => new THREE.Vector2(x, -z)))
		const floorMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), thin)
		floorMesh.rotation.x = -Math.PI / 2
		this.roomGroup.add(floorMesh)
		plane(openWidth(r) * frontSlope(r), r.h - r.door, [mx, (r.h + r.door) / 2, frontZ(r, mx)], frontAngle(r))
		if (r.ret > 0 && r.retD > 0) block(r.ret, r.retD, [r.ret / 2, r.h / 2, r.dl - r.retD / 2])
		if (r.retR > 0 && r.retRD > 0) block(r.retR, r.retRD, [r.w - r.retR / 2, r.h / 2, r.dr - r.retRD / 2])
	}

	private buildShelves() {
		const plan = this.plan!
		const r = plan.room
		this.clear(this.shelfGroup)
		this.pickables = []
		for (const b of boards(plan)) {
			const mat = new THREE.MeshLambertMaterial({ color: this.css(TYPES[b.t].color) })
			const geo = b.door ? new THREE.BoxGeometry(b.len, r.th, b.d) : new THREE.BoxGeometry(b.x1 - b.x0, r.th, b.z1 - b.z0)
			const m = new THREE.Mesh(geo, mat)
			if (b.door) {
				const mx = (b.x0 + b.x1) / 2
				m.position.set(mx, b.y - r.th / 2, frontZ(r, mx) - b.d / 2)
				m.rotation.y = frontAngle(r)
			} else {
				m.position.set((b.x0 + b.x1) / 2, b.y - r.th / 2, (b.z0 + b.z1) / 2)
			}
			m.userData.i = b.i
			m.userData.wall = b.wall
			this.shelfGroup.add(m)
			this.pickables.push(m)
		}
		this.buildFixings()
		this.applyHighlight()
	}

	/**
	 * Battens and brackets, drawn under each board. Each board gets a group whose origin is the middle
	 * of its wall edge: local x runs along the wall, local z into the room, local y down from the underside.
	 */
	private buildFixings() {
		this.clear(this.fixGroup)
		if (this.showFixings === 'none' || !this.plan) return
		const r = this.plan.room
		const BW = 3.8 // batten width and height (cm)
		const BH = 2.5
		const batten = new THREE.MeshLambertMaterial({ color: this.css('--color-accent') })
		const bracket = new THREE.MeshLambertMaterial({ color: this.css('--color-text') })
		const box = (g: THREE.Object3D, mat: THREE.Material, size: [number, number, number], pos: [number, number, number]) => {
			const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat)
			m.position.set(...pos)
			g.add(m)
		}
		for (const b of boards(this.plan)) {
			const canBatten = !!battenPieces(this.plan, b)
			const battens = canBatten && this.showFixings !== 'brackets'
			const brackets = this.showFixings === 'brackets' || !canBatten
			const g = new THREE.Group()
			const top = b.y - r.th
			if (b.door) {
				const mx = (b.x0 + b.x1) / 2
				g.position.set(mx, top, frontZ(r, mx) - b.d)
				g.rotation.y = frontAngle(r)
			} else if (b.wall === 'Left') {
				g.position.set(b.x0, top, (b.z0 + b.z1) / 2)
				g.rotation.y = Math.PI / 2
			} else if (b.wall === 'Right') {
				g.position.set(b.x1, top, (b.z0 + b.z1) / 2)
				g.rotation.y = -Math.PI / 2
			} else g.position.set((b.x0 + b.x1) / 2, top, b.z0)
			if (battens) {
				box(g, batten, [b.len, BH, BW], [0, -BH / 2, BW / 2])
				// Side shelves also sit on a batten across the back wall under their back end.
				if (b.wall === 'Left' || b.wall === 'Right') {
					box(this.fixGroup, batten, [b.d, BH, BW], [(b.x0 + b.x1) / 2, top - BH / 2, b.z0 + BW / 2])
				}
				// A wall-to-wall back shelf is held at both ends too.
				if (b.wall === 'Back') {
					for (const x of [b.x0 + BW / 2, b.x1 - BW / 2]) box(this.fixGroup, batten, [BW, BH, b.d], [x, top - BH / 2, b.z0 + b.d / 2])
				}
			}
			const n = brackets ? bracketsFor(b.len) : 0
			const end = Math.min(BRACKET_END, b.len / 2)
			for (let k = 0; k < n; k++) {
				const x = -b.len / 2 + end + ((b.len - 2 * end) * k) / (n - 1)
				box(g, bracket, [2, 0.5, b.d * 0.8], [x, -0.25, b.d * 0.4])
				box(g, bracket, [2, 8, 0.5], [x, -4, 0.25])
			}
			this.fixGroup.add(g)
		}
	}

	/**
	 * Selection and figure highlights only change how the existing shelves look, so hovering a
	 * figure updates materials in place and redraws the clear-space volume rather than every mesh.
	 */
	private applyHighlight() {
		const plan = this.plan
		if (!plan) return
		const r = plan.room
		const hl = this.highlight
		const c = clearances(plan)
		const lit = (i: number, wall: string) =>
			hl === 'run' ||
			(hl === 'walk' && i === c.walkLevel && (wall === 'Left' || wall === 'Right')) ||
			(hl === 'depth' && i === c.depthLevel && wall === 'Back')
		for (const m of this.pickables) {
			const mat = m.material as THREE.MeshLambertMaterial
			const on = lit(m.userData.i, m.userData.wall)
			const faded = !!hl && !on
			if (mat.transparent !== faded) mat.needsUpdate = true
			Object.assign(mat, { transparent: faded, opacity: faded ? 0.15 : 1, depthWrite: !faded })
			mat.emissive.set(m.userData.i === this.selected || (hl && on) ? 0x333333 : 0x000000)
		}
		this.clear(this.hlGroup)
		if (hl !== 'walk' && hl !== 'depth') return
		// Nothing to show when the shelves leave no clear space.
		if ((hl === 'walk' && c.walk <= 0) || (hl === 'depth' && c.depth <= 0)) return
		// The clear space the figure measures: floor to head height, between the shelves and the front.
		const [x0, x1] = hl === 'walk' ? c.walkX : [0, r.w]
		const z0 = hl === 'depth' ? c.depthZ : 0
		const h = Math.min(HEAD, r.h)
		const geo = new THREE.BoxGeometry(x1 - x0, h, c.front - z0)
		const accent = this.css('--color-accent')
		const box = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22, depthWrite: false }))
		const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: accent }))
		for (const o of [box, edges]) {
			o.position.set((x0 + x1) / 2, h / 2, (z0 + c.front) / 2)
			this.hlGroup.add(o)
		}
	}

	private resize() {
		const { clientWidth: w, clientHeight: h } = this.el
		if (!w || !h) return
		this.renderer.setSize(w, h)
		this.camera.aspect = w / h
		this.camera.updateProjectionMatrix()
		this.update()
	}

	private update() {
		const t = this.target
		this.camera.position.set(
			t.x + this.rad * Math.sin(this.ph) * Math.sin(this.th),
			t.y + this.rad * Math.cos(this.ph),
			t.z + this.rad * Math.sin(this.ph) * Math.cos(this.th),
		)
		this.camera.lookAt(t)
		this.draw()
	}

	private draw() {
		this.renderer.render(this.scene, this.camera)
	}

	private bindPointer() {
		const el = this.renderer.domElement
		el.style.touchAction = 'none'
		const ray = new THREE.Raycaster()
		const zoom = (f: number) => {
			this.rad = Math.min(1400, Math.max(180, this.rad * f))
			this.update()
		}
		const down = (e: PointerEvent) => {
			this.pointers.set(e.pointerId, [e.clientX, e.clientY])
			el.setPointerCapture(e.pointerId)
			// A second finger makes it a pinch, never a tap.
			this.moved = this.pointers.size > 1 ? 99 : 0
		}
		const move = (e: PointerEvent) => {
			const p = this.pointers.get(e.pointerId)
			if (!p) return
			this.pointers.set(e.pointerId, [e.clientX, e.clientY])
			if (this.pointers.size === 2) {
				const [a, b] = [...this.pointers.values()]
				const d = Math.hypot(a[0] - b[0], a[1] - b[1])
				if (this.pinch) zoom(this.pinch / d)
				this.pinch = d
				this.moved = 99
				return
			}
			const dx = e.clientX - p[0]
			const dy = e.clientY - p[1]
			this.moved += Math.abs(dx) + Math.abs(dy)
			this.th -= dx * 0.008
			this.ph = Math.min(Math.PI - 0.05, Math.max(0.05, this.ph - dy * 0.008))
			this.update()
		}
		const up = (e: PointerEvent) => {
			// Only a still, primary, left-button (or touch) release picks a shelf.
			if (this.pointers.size === 1 && this.moved < 6 && e.isPrimary && e.button === 0) {
				const rect = el.getBoundingClientRect()
				ray.setFromCamera(
					new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
					this.camera,
				)
				const hit = ray.intersectObjects(this.pickables)[0]
				if (hit) this.onPick(hit.object.userData.i as number)
			}
			this.pointers.delete(e.pointerId)
			this.pinch = 0
		}
		const cancel = (e: PointerEvent) => {
			this.pointers.delete(e.pointerId)
			this.pinch = 0
		}
		const wheel = (e: WheelEvent) => {
			e.preventDefault()
			// Line and page wheel modes (Firefox, some mice) report far smaller numbers than pixel mode.
			const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY
			zoom(1 + Math.max(-0.5, Math.min(0.5, px * 0.001)))
		}
		el.addEventListener('pointerdown', down)
		el.addEventListener('pointermove', move)
		el.addEventListener('pointerup', up)
		el.addEventListener('pointercancel', cancel)
		el.addEventListener('wheel', wheel, { passive: false })
	}
}
