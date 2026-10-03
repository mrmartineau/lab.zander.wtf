import { clone, DEFAULT_STATE, merge, type WAState } from './engine'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] }

const BASE: WAState = merge(clone(DEFAULT_STATE), {
	spacing: 0,
	stroke: { width: 0 },
	extrude: { depth: 0 },
	shadow: { x: 0, y: 0, blur: 0 },
	shape: { curve: 0, wave: 0, freq: 1, bulge: 0, taper: 0 },
})

const p = (name: string, over: DeepPartial<WAState>) => ({ name, state: merge(clone(BASE), over) as WAState })

const RAINBOW = ['#ff3b3b', '#ff9f1c', '#ffe23b', '#3bd16f', '#3b8bff', '#a259ff']

/** The gallery — a love letter to the 1990s WordArt dialog. */
export const PRESETS = [
	p('Rainbow arch', {
		font: 'Luckiest Guy',
		spacing: 2,
		fill: { type: 'linear', angle: 90, stops: RAINBOW, hard: false },
		stroke: { width: 2, color: '#1b1340' },
		extrude: { depth: 14, angle: 50, color: '#3a2a8c' },
		shadow: { y: 10, blur: 18, color: '#00000066' },
		shape: { curve: 70 },
	}),
	p('Chrome', {
		font: 'Ultra',
		fill: { type: 'linear', angle: 180, stops: ['#f4f8ff', '#9aa7b8', '#2a3340', '#d6dfeb'], hard: true },
		stroke: { width: 1.5, color: '#0d1420' },
		extrude: { depth: 18, angle: 90, color: '#2a4a8a' },
		tf: { tiltX: 28 },
		shadow: { y: 16, blur: 20, color: '#00000080' },
	}),
	p('Sunset wave', {
		font: 'Pacifico',
		fill: { type: 'linear', angle: 180, stops: ['#ffe259', '#ff7b39', '#e3166b'], hard: false },
		stroke: { width: 1, color: '#5a0a2c' },
		extrude: { depth: 8, angle: 70, color: '#7a1640' },
		shape: { wave: 30, freq: 1.5 },
		anim: 'wave',
	}),
	p('Round & round', {
		font: 'Righteous',
		size: 90,
		spacing: 6,
		text: 'ROUND AND ROUND • ',
		fill: { type: 'conic', angle: 0, stops: ['#00e0ff', '#3b5bff', '#c03bff'], hard: false },
		stroke: { width: 1, color: '#0a1040' },
		shape: { curve: 360 },
		anim: 'flow',
	}),
	p('Retro 3D', {
		font: 'Shrikhand',
		fill: { type: 'linear', angle: 180, stops: ['#ffe14d', '#ff4d4d'], hard: false },
		stroke: { width: 1.5, color: '#3d0d0d' },
		extrude: { depth: 26, angle: 35, color: '#8a2a12' },
		tf: { rotate: -8, skew: -10 },
	}),
	p('Neon', {
		font: 'Monoton',
		fill: { type: 'linear', angle: 90, stops: ['#ff4ffd', '#4ff6ff'], hard: false },
		shadow: { x: 0, y: 0, blur: 22, color: '#ff4ffdcc' },
		anim: 'rainbow',
	}),
	p('Slime', {
		font: 'Creepster',
		spacing: 4,
		fill: { type: 'linear', angle: 180, stops: ['#d6ff4d', '#2bd14a', '#0b6b2a'], hard: false },
		stroke: { width: 2, color: '#062b10' },
		shape: { bulge: 60 },
		anim: 'jelly',
	}),
	p('Gold', {
		font: 'Cinzel Decorative',
		weight: 900,
		fill: { type: 'linear', angle: 180, stops: ['#fff3b0', '#e8b923', '#8a5a00', '#ffd65c'], hard: false },
		stroke: { width: 1, color: '#4a2d00' },
		extrude: { depth: 10, angle: 90, color: '#5c3b00' },
		shape: { curve: -40 },
	}),
	p('Arcade', {
		font: 'Press Start 2P',
		size: 80,
		fill: { type: 'linear', angle: 180, stops: ['#ffef3b', '#ff8a1c', '#ff2a6d', '#7a2aff'], hard: true },
		extrude: { depth: 12, angle: 90, color: '#1a0b4a' },
		tf: { tiltX: 45 },
		shape: { taper: -30 },
	}),
	p('Bubblegum', {
		font: 'Chewy',
		spacing: 3,
		fill: { type: 'radial', angle: 0, stops: ['#ffd6f5', '#ff5fc7', '#a01a8a'], hard: false },
		stroke: { width: 4, color: '#ffffff' },
		extrude: { depth: 10, angle: 60, color: '#7a1270' },
		shape: { bulge: 45, curve: 30 },
		anim: 'float',
	}),
	p('Comic', {
		font: 'Bangers',
		spacing: 4,
		fill: { type: 'linear', angle: 180, stops: ['#fff14d', '#ffb800'], hard: false },
		stroke: { width: 3, color: '#000000' },
		extrude: { depth: 12, angle: 45, color: '#e0201a' },
		tf: { rotate: -6, stretch: 1.2 },
		anim: 'swing',
	}),
	p('Ice', {
		font: 'Rubik Mono One',
		fill: { type: 'linear', angle: 135, stops: ['#ffffff', '#a8e6ff', '#3fa9f5', '#e4f7ff'], hard: false },
		stroke: { width: 1, color: '#0b3a6b' },
		extrude: { depth: 10, angle: 120, color: '#1c6db0' },
		shape: { taper: 40 },
	}),
	p('Spooky', {
		font: 'Rubik Wet Paint',
		fill: { type: 'linear', angle: 180, stops: ['#ff9a1c', '#ff4d00', '#5a0aa0'], hard: false },
		shadow: { x: 0, y: 0, blur: 16, color: '#ff6a00aa' },
		shape: { wave: 18, freq: 2 },
	}),
	p('Space', {
		font: 'Orbitron',
		weight: 900,
		spacing: 12,
		fill: { type: 'linear', angle: 90, stops: ['#7af0ff', '#ffffff', '#ff7af6'], hard: false },
		extrude: { depth: 6, angle: 90, color: '#2a1a6b' },
		tf: { tiltX: 55 },
		anim: 'flow',
	}),
	p('Sticker', {
		font: 'Titan One',
		fill: { type: 'linear', angle: 90, stops: ['#3bd16f', '#3b8bff'], hard: true },
		stroke: { width: 7, color: '#ffffff' },
		shadow: { x: 0, y: 6, blur: 10, color: '#00000055' },
		tf: { rotate: 4 },
	}),
	p('Spin', {
		font: 'Bungee',
		fill: { type: 'linear', angle: 135, stops: ['#ff3b3b', '#ffe23b'], hard: true },
		extrude: { depth: 10, angle: 45, color: '#1b1340' },
		anim: 'spin',
	}),
]

/** Curated, kid-friendly Google Fonts. Any other Google Font name works too. */
export const FONTS = [
	'Luckiest Guy', 'Bungee', 'Bungee Shade', 'Bungee Spice', 'Bungee Inline', 'Nabla', 'Honk',
	'Lobster', 'Pacifico', 'Bangers', 'Monoton', 'Righteous', 'Rubik Mono One', 'Rubik Bubbles',
	'Rubik Glitch', 'Rubik Moonrocks', 'Rubik Wet Paint', 'Rubik Beastly', 'Fredoka',
	'Permanent Marker', 'Press Start 2P', 'Silkscreen', 'Shrikhand', 'Abril Fatface',
	'Black Ops One', 'Creepster', 'Fascinate', 'Frijole', 'Ultra', 'Alfa Slab One', 'Bowlby One',
	'Chewy', 'Comic Neue', 'Gloria Hallelujah', 'Grandstander', 'Lilita One', 'Titan One',
	'Passion One', 'Russo One', 'Audiowide', 'Orbitron', 'Cinzel Decorative', 'UnifrakturMaguntia',
	'Pirata One', 'Sniglet', 'Carter One', 'Coiny', 'Rampart One', 'Sigmar', 'Wallpoet',
	'Faster One', 'Codystar', 'Ewert', 'Plaster', 'Erica One', 'Modak', 'Londrina Solid',
	'Knewave', 'Kavoon', 'Rye', 'Oi', 'Climate Crisis', 'Bagel Fat One', 'Chango',
	'Dela Gothic One', 'Anton', 'Bebas Neue', 'Playfair Display', 'Inter',
]

export const SWATCHES = [
	'#ff3b3b', '#ff9f1c', '#ffe23b', '#3bd16f', '#00e0ff', '#3b8bff', '#a259ff', '#ff5fc7',
	'#ffffff', '#9aa7b8', '#1b1340', '#000000',
]
