/* WebGL2 renderer: one full-screen triangle, one fragment shader per mode.
   Every Params key reaches the shader as `u_<key>`; unused ones are no-ops. */
import type { Mode, Params } from './engine'

const VERT = `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2. - 1., 0., 1.);
}`

const HEAD = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res, u_offset;
uniform float u_flip;
uniform float u_phase, u_seed;
uniform vec3 u_c1, u_c2, u_c3, u_c4, u_bg;
uniform float u_lightAngle, u_lightHeight, u_soft, u_ambient;
uniform float u_grain, u_grainSize, u_dots, u_dotSize, u_vignette, u_exposure, u_saturation;
// Offsets for items dragged on the canvas, one per blob, point or layer (MAX_BLOBS is the most)
uniform vec2 u_nudge[50];
#define PI 3.14159265
#define TAU 6.28318531
// Evolve runs 0–100; T makes one full loop over it, so animations repeat seamlessly.
#define T (u_phase * TAU / 100.)

float hash(vec2 p) {
	vec3 q = fract(p.xyx * .1031);
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}
float rnd(float i, float k) { return hash(vec2(i * 7.13 + k * 1.37, u_seed * 3.71 + k)); }

float noise(vec2 p) {
	vec2 i = floor(p) + u_seed * 1.618, f = fract(p);
	vec2 u = f * f * (3. - 2. * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), u.x), u.y);
}
float fbm(vec2 p) {
	float v = 0., a = .5;
	mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
	for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= .5; }
	return v;
}

// c1 → c4 as a smooth gradient over 0–1
vec3 ramp(float t) {
	t = clamp(t, 0., 1.) * 3.;
	vec3 a = t < 1. ? u_c1 : t < 2. ? u_c2 : u_c3;
	vec3 b = t < 1. ? u_c2 : t < 2. ? u_c3 : u_c4;
	return mix(a, b, smoothstep(0., 1., fract(min(t, 2.9999))));
}
// c1–c4 repeating
vec3 pal(float i) {
	int k = int(mod(i, 4.));
	return k == 0 ? u_c1 : k == 1 ? u_c2 : k == 2 ? u_c3 : u_c4;
}

vec3 lightDir() {
	float a = radians(u_lightAngle), h = radians(u_lightHeight);
	return normalize(vec3(cos(a) * cos(h), sin(a) * cos(h), sin(h)));
}
// Wrapped diffuse: softness lets light creep round the terminator
float shade(vec3 n) {
	float d = clamp((dot(n, lightDir()) + u_soft) / (1. + u_soft), 0., 1.);
	return u_ambient + (1. - u_ambient) * d;
}
`

const SCENES: Record<Mode, string> = {
	blobs: `
uniform float u_blobCount, u_blobSize, u_blobSpread, u_blobSmooth, u_rim, u_gloss;
#define MAX_BLOBS 50
vec4 B[MAX_BLOBS];
float smin(float a, float b, float k) {
	float h = max(k - abs(a - b), 0.) / max(k, 1e-4);
	return min(a, b) - h * h * k * .25;
}
float map(vec3 p) {
	float d = 1e9;
	for (int i = 0; i < MAX_BLOBS; i++) {
		if (float(i) >= u_blobCount) break;
		d = smin(d, length(p - B[i].xyz) - B[i].w, u_blobSmooth);
	}
	return d;
}
vec3 tint(vec3 p) {
	vec3 c = vec3(0); float ws = 0.;
	for (int i = 0; i < MAX_BLOBS; i++) {
		if (float(i) >= u_blobCount) break;
		float w = exp(-max(length(p - B[i].xyz) - B[i].w, 0.) * 24.);
		c += pal(float(i)) * w; ws += w;
	}
	return c / max(ws, 1e-4);
}
vec3 scene(vec2 p) {
	for (int i = 0; i < MAX_BLOBS; i++) {
		float f = float(i);
		vec3 r = vec3(rnd(f, 1.), rnd(f, 2.), rnd(f, 3.)) * 2. - 1.;
		vec3 wobble = .08 * vec3(sin(T + f * 2.4), cos(2. * T + f * 1.3), sin(T + f));
		// Spread 1 reaches the frame edges (the camera sees ±.78 at z = 0)
		vec2 xy = r.xy * u_blobSpread * .78 * vec2(u_res.x / u_res.y, 1);
		B[i] = vec4(vec3(xy + u_nudge[i], r.z * .2) + wobble, u_blobSize * (.6 + .8 * rnd(f, 4.)));
	}
	vec3 bg = mix(u_bg, u_bg * .9, smoothstep(-.8, .8, p.x - p.y));
	vec3 ro = vec3(0, 0, 2.5), rd = normalize(vec3(p, -1.6));
	float t = 0.;
	bool hit = false;
	for (int i = 0; i < 100; i++) {
		float d = map(ro + rd * t);
		if (d < .0005) { hit = true; break; }
		t += d;
		if (t > 5.) break;
	}
	if (!hit) return bg;
	vec3 q = ro + rd * t;
	// Tetrahedron normal: 4 map() calls, not 6 — it matters with 50 blobs
	vec2 e = vec2(.001, -.001);
	vec3 n = normalize(e.xyy * map(q + e.xyy) + e.yyx * map(q + e.yyx) + e.yxy * map(q + e.yxy) + e.xxx * map(q + e.xxx));
	float occ = 0.;
	for (int k = 1; k <= 5; k++) {
		float h = .025 * float(k);
		occ += (h - map(q + n * h)) * pow(.6, float(k));
	}
	float ao = clamp(1. - 3. * occ, 0., 1.);
	vec3 col = tint(q) * shade(n) * ao;
	col += u_gloss * pow(max(dot(reflect(rd, n), lightDir()), 0.), 24.);
	float fres = pow(1. - max(dot(n, -rd), 0.), 3.);
	return u_rim < 0. ? col * (1. + u_rim * fres) : mix(col, vec3(1), u_rim * fres);
}`,

	folds: `
uniform float u_foldScale, u_foldDepth, u_foldWarp, u_foldSharp;
// Three soft octaves: more reads as crumpled paper, not silk
float silk(vec2 p) {
	float v = 0., a = .55;
	mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
	for (int i = 0; i < 3; i++) { v += a * noise(p); p = m * p; a *= .4; }
	return v / .9;
}
float height(vec2 p) {
	p *= u_foldScale;
	vec2 o = .4 * vec2(cos(T), sin(T));
	vec2 w = vec2(silk(p + o), silk(p + vec2(5.2, 1.3) - o));
	float h = silk(p + u_foldWarp * 2. * w);
	return mix(h, 1. - abs(2. * h - 1.), u_foldSharp);
}
vec3 scene(vec2 p) {
	float e = .002, h = height(p);
	vec2 g = vec2(height(p + vec2(e, 0)) - h, height(p + vec2(0, e)) - h) / e;
	vec3 n = normalize(vec3(-g * u_foldDepth, 1.));
	return ramp(shade(n));
}`,

	conic: `
uniform float u_conicPoints, u_conicSpread, u_conicFalloff, u_conicSoft, u_conicTwist;
vec3 scene(vec2 p) {
	vec3 acc = vec3(0); float ws = 0.;
	for (int i = 0; i < 6; i++) {
		float f = float(i);
		if (f >= u_conicPoints) break;
		vec2 c = (vec2(rnd(f, 1.), rnd(f, 2.)) * 2. - 1.) * u_conicSpread + .05 * vec2(sin(T + f * 2.), cos(T + f * 3.)) + u_nudge[i];
		vec2 d = p - c;
		float r = length(d);
		float a = atan(d.y, d.x) + rnd(f, 3.) * TAU + u_conicTwist * r + T * (mod(f, 2.) * 2. - 1.);
		float t = fract(a / TAU);
		// t wraps from 1 to 0 here: start from ramp(1) so seam blur hides the jump
		vec3 col = mix(ramp(1.), ramp(t), smoothstep(0., u_conicSoft + 1e-4, t));
		float w = 1. / pow(r + .02, u_conicFalloff);
		acc += col * w; ws += w;
	}
	return acc / ws;
}`,

	shards: `
uniform float u_shardCount, u_shardLayers, u_shardBlur, u_shardSpin, u_shardSpread;
vec3 scene(vec2 p) {
	vec3 col = u_bg;
	for (int i = 0; i < 5; i++) {
		float f = float(i);
		if (f >= u_shardLayers) break;
		vec2 d = p - (vec2(rnd(f, 1.), rnd(f, 2.)) * 2. - 1.) * u_shardSpread - u_nudge[i];
		float r = length(d);
		// Turning by whole spikes per loop keeps the animation seamless
		float a = atan(d.y, d.x) + u_shardSpin * r + T * (f + 1.) / u_shardCount;
		float s = clamp((fract(a / TAU * u_shardCount + rnd(f, 4.)) - .5) / .5, 0., 1.);
		float spike = s * (1. - smoothstep(1. - max(u_shardBlur, .004), 1., s));
		float v = spike * smoothstep(0., .25 + .5 * rnd(f, 5.), r) * (.4 + .6 * rnd(f, 6.));
		col = max(col, ramp(sqrt(v)) * smoothstep(0., .3, v));
	}
	return col;
}`,

	arcs: `
uniform float u_arcY, u_arcRadius, u_arcBands, u_arcBlur, u_arcChroma, u_arcFade;
vec3 band(float r) {
	float x0 = (u_arcRadius - r) / u_arcRadius * u_arcBands;
	float x = x0 - T / TAU * 4.;
	float i = floor(x), b = u_arcBlur * .5;
	vec3 col = mix(pal(i), pal(i + 1.), smoothstep(.5 - b, .5 + b + 1e-4, fract(x)));
	col *= mix(1., pow(clamp(r / u_arcRadius, 0., 1.), 4.), u_arcFade);
	return mix(u_bg, col, smoothstep(-.02 - u_arcBlur * .3, .02 + u_arcBlur * .3, x0));
}
vec3 scene(vec2 p) {
	float r = length(p - vec2(0, u_arcY) - u_nudge[0]);
	return vec3(band(r - u_arcChroma).r, band(r).g, band(r + u_arcChroma).b);
}`,

	swarm: `
uniform float u_swarmBirds, u_swarmSize, u_swarmScale, u_swarmWarp, u_swarmThin, u_swarmSpread, u_swarmScatter;
// Murmuration: a warped density field, sampled by birds on a jittered grid
float flock(vec2 p) {
	vec2 o = .5 * vec2(cos(T), sin(T));
	vec2 q = p * u_swarmScale;
	vec2 w = vec2(fbm(q + o), fbm(q + vec2(3.1, 7.7) - o));
	float f = fbm(q + u_swarmWarp * 2.5 * w);
	// Soft-edged clouds inside an oval body, like a flock seen from below
	float body = 1. - smoothstep(.3, 1., length(p / vec2(u_swarmSpread * 1.6, u_swarmSpread)));
	return smoothstep(.5 - u_swarmThin, .5 + u_swarmThin, f * (.6 + .8 * body)) * body;
}
vec3 scene(vec2 p) {
	vec3 col = mix(u_bg, u_c2, smoothstep(.5, -.5, p.y));
	float n = u_swarmBirds;
	vec2 g = p * n;
	float ppc = u_res.y / n; // pixels per cell, for anti-aliasing
	for (int y = -1; y <= 1; y++)
		for (int x = -1; x <= 1; x++) {
			vec2 c = floor(g) + vec2(x, y);
			float h1 = hash(c + u_seed), h2 = hash(c.yx - u_seed), h3 = hash(c * 1.7 + 3.1);
			vec2 jitter = (vec2(h1, h2) - .5) * u_swarmScatter;
			vec2 pos = c + .5 + jitter + .25 * vec2(sin(T + h1 * TAU), cos(T + h2 * TAU));
			float d = flock(pos / n - u_nudge[0]);
			if (h3 > d) continue;
			float r = u_swarmSize * (.4 + .6 * d) * (.6 + .8 * h2);
			float m = 1. - smoothstep(r - 1. / ppc, r + 1. / ppc, length(g - pos));
			col = mix(col, mix(u_c3, u_c1, d), m);
		}
	return col;
}`,
}

const MAIN = `
void main() {
	vec2 fc = gl_FragCoord.xy + u_offset;
	// Upside down for readPixels, whose rows run bottom-up
	if (u_flip > .5) fc.y = u_res.y - fc.y;
	// Sizes are in units of 1/1000 of the image height, so exports match the preview
	float px = u_res.y / 1000.;
	float cell = max(u_dotSize * px, 2.);
	vec2 sc = u_dots > .5 ? (floor(fc / cell) + .5) * cell : fc;
	vec3 col = scene((sc - .5 * u_res) / u_res.y);
	col *= exp2(u_exposure);
	vec3 W = vec3(.2126, .7152, .0722);
	col = mix(vec3(dot(col, W)), col, u_saturation);
	if (u_dots > .5) {
		float r = sqrt(clamp(abs(dot(col, W) - dot(u_bg, W)), 0., 1.)) * .75;
		float d = length(fract(fc / cell) - .5);
		col = mix(u_bg, col, 1. - smoothstep(r - 1. / cell, r + 1. / cell, d));
	}
	vec2 v = (fc - .5 * u_res) / u_res.y;
	col *= 1. - u_vignette * dot(v, v) * 1.6;
	col += (hash(floor(fc / max(u_grainSize * px, 1.)) + u_phase * 13.1 + u_seed) - .5) * u_grain;
	col += (hash(fc * .73 + 9.1) - .5) / 255.;
	o = vec4(clamp(col, 0., 1.), 1);
}`

type Prog = { prog: WebGLProgram; locs: Map<string, WebGLUniformLocation | null> }

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]

export class Renderer {
	readonly gl: WebGL2RenderingContext
	private progs = new Map<Mode, Prog>()
	private flip = false

	/** `keep` preserves the drawing buffer, for canvases read back with toBlob / toDataURL. */
	constructor(
		readonly canvas: HTMLCanvasElement,
		keep = false,
	) {
		const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: keep })
		if (!gl) throw new Error('This browser has no WebGL2.')
		this.gl = gl
	}

	private program(mode: Mode): Prog {
		const cached = this.progs.get(mode)
		if (cached) return cached
		const { gl } = this
		const prog = gl.createProgram()!
		for (const [type, src] of [
			[gl.VERTEX_SHADER, VERT],
			[gl.FRAGMENT_SHADER, HEAD + SCENES[mode] + MAIN],
		] as const) {
			const sh = gl.createShader(type)!
			gl.shaderSource(sh, src)
			gl.compileShader(sh)
			if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'Shader failed')
			gl.attachShader(prog, sh)
		}
		gl.linkProgram(prog)
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Link failed')
		const p = { prog, locs: new Map() }
		this.progs.set(mode, p)
		return p
	}

	/** Draw the part of a `w`×`h` image that starts at (`x`, `y`) — from the bottom left — into this canvas. */
	draw(params: Params, w: number, h: number, x = 0, y = 0, tw = w, th = h) {
		const { gl, canvas } = this
		if (canvas.width !== tw) canvas.width = tw
		if (canvas.height !== th) canvas.height = th
		const { prog, locs } = this.program(params.mode)
		const loc = (name: string) => {
			if (!locs.has(name)) locs.set(name, gl.getUniformLocation(prog, name))
			return locs.get(name)!
		}
		gl.useProgram(prog)
		gl.viewport(0, 0, tw, th)
		gl.uniform2f(loc('u_res'), w, h)
		gl.uniform2f(loc('u_offset'), x, y)
		gl.uniform1f(loc('u_flip'), this.flip ? 1 : 0)
		for (const [k, v] of Object.entries(params)) {
			const l = loc(`u_${k}`)
			if (!l || typeof v === 'object') continue
			if (typeof v === 'string') gl.uniform3f(l, ...rgb(v))
			else gl.uniform1f(l, Number(v))
		}
		const nudge = new Float32Array(100)
		nudge.set((params.nudge[params.mode] ?? []).slice(0, 100))
		gl.uniform2fv(loc('u_nudge'), nudge)
		gl.drawArrays(gl.TRIANGLES, 0, 3)
	}

	/**
	 * Render a full-size image tile by tile onto a 2D canvas. The browser can
	 * quietly give a WebGL canvas a smaller drawing buffer than asked for (it
	 * did at 8192px), which cropped exports; small tiles never hit that limit,
	 * and each draw stays short enough for the GPU watchdog.
	 */
	render(params: Params, w: number, h: number): HTMLCanvasElement {
		const { gl } = this
		const out = document.createElement('canvas')
		out.width = w
		out.height = h
		const ctx = out.getContext('2d')!
		const TILE = 1024
		for (let y = 0; y < h; y += TILE)
			for (let x = 0; x < w; x += TILE) {
				const tw = Math.min(TILE, w - x)
				const th = Math.min(TILE, h - y)
				this.draw(params, w, h, x, y, tw, th)
				const px = new Uint8ClampedArray(tw * th * 4)
				gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, px)
				// GL rows run bottom-up; the 2D canvas runs top-down
				const img = new ImageData(tw, th)
				for (let row = 0; row < th; row++)
					img.data.set(px.subarray(row * tw * 4, (row + 1) * tw * 4), (th - 1 - row) * tw * 4)
				ctx.putImageData(img, x, h - y - th)
			}
		return out
	}

	/** Draw a whole `w`×`h` frame and read it into `buf` as top-down RGBA, ready for a video encoder. */
	pixels(params: Params, w: number, h: number, buf: Uint8Array) {
		const { gl } = this
		this.flip = true
		this.draw(params, w, h)
		this.flip = false
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
	}

	dispose() {
		this.gl.getExtension('WEBGL_lose_context')?.loseContext()
	}
}
