// PNG, SVG and video exports. Each frame goes SVG → <img> → <canvas>.
import { BufferTarget, Mp4OutputFormat, WebMOutputFormat, Output, Quality, VideoSample, VideoSampleSource, canEncodeVideo } from 'mediabunny'
import { SIZES, type Doc } from './doc'
import { frameSvg } from './render'

const yieldToPage = () =>
	new Promise<void>((r) => {
		const c = new MessageChannel()
		c.port1.onmessage = () => r()
		c.port2.postMessage(null)
	})

/** Output size: the long side at 1920, both sides even for the video encoder. */
export function outSize(doc: Doc) {
	const [w, h] = SIZES[doc.size]
	const k = 1920 / Math.max(w, h)
	const even = (v: number) => Math.round((v * k) / 2) * 2
	return [even(w), even(h)] as const
}

async function drawFrame(doc: Doc, frame: number, ctx: CanvasRenderingContext2D) {
	const img = new Image()
	img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(frameSvg(doc, frame))}`
	await img.decode()
	ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height)
}

function canvasFor(doc: Doc) {
	const [w, h] = outSize(doc)
	const canvas = document.createElement('canvas')
	canvas.width = w
	canvas.height = h
	return canvas.getContext('2d')!
}

export async function png(doc: Doc, frame: number) {
	const ctx = canvasFor(doc)
	await drawFrame(doc, frame, ctx)
	return new Promise<Blob>((r, j) => ctx.canvas.toBlob((b) => (b ? r(b) : j(new Error('No PNG'))), 'image/png'))
}

export const svg = (doc: Doc, frame: number) => new Blob([frameSvg(doc, frame)], { type: 'image/svg+xml' })

/**
 * The whole animation as an MP4, or a WebM where the browser can't make H.264
 * (Chromium without proprietary codecs). Video has no loop flag, so a looping
 * animation repeats until the video is at least `minSeconds` long.
 */
export async function video(doc: Doc, progress: (t: number) => void, cancelled: () => boolean, minSeconds = 6): Promise<Blob | string | null> {
	const ctx = canvasFor(doc)
	const { width: w, height: h } = ctx.canvas
	const rate = doc.fps
	const quality = new Quality({ bitrate: Math.min(w * h * rate * 0.15, 20e6) })
	const config = { width: w, height: h, quality, frameRate: rate }
	const mp4 = await canEncodeVideo('avc', config)
	if (!mp4 && !(await canEncodeVideo('vp9', config))) return "This browser can't make video"
	const passes = doc.loop ? Math.max(1, Math.ceil((minSeconds * rate) / doc.frames)) : 1
	const total = doc.frames * passes
	const format = mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat()
	const output = new Output({ format, target: new BufferTarget() })
	const source = new VideoSampleSource({ codec: mp4 ? 'avc' : 'vp9', quality })
	output.addVideoTrack(source, { frameRate: rate })
	await output.start()
	for (let i = 0; i < total; i++) {
		if (cancelled()) {
			await output.cancel()
			return null
		}
		await drawFrame(doc, i % doc.frames, ctx)
		const sample = new VideoSample(ctx.canvas, { timestamp: i / rate, duration: 1 / rate })
		await source.add(sample)
		sample.close()
		progress((i + 1) / total)
		if (i % 4 === 0) await yieldToPage()
	}
	await output.finalize()
	return new Blob([output.target.buffer!], { type: mp4 ? 'video/mp4' : 'video/webm' })
}
