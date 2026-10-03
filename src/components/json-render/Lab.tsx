import { createSpecStreamCompiler, nestedToFlat, type Spec } from '@json-render/core'
import { createStateStore, JSONUIProvider, Renderer, type StateStore } from '@json-render/react'
import { Badge, Button, Input, Pre } from '@mrmartineau/zui/react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { catalog, handlers, registry } from './catalog'
import { fakeReply, scenarios } from './replies'

type Message =
	| { id: number; role: 'user'; text: string }
	| { id: number; role: 'ai'; text: string; spec: Spec | null; jsonl: string; streaming: boolean; store: StateStore }

type Tab = 'stream' | 'spec' | 'state' | 'prompt'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const actionHandlers = handlers(() => undefined, () => ({}))
const systemPrompt = catalog.prompt()

/** The same JSONL patch lines a real model streams: root first, then elements parent-before-child. */
function toJsonl(spec: Spec) {
	const lines: object[] = [{ op: 'add', path: '/root', value: spec.root }]
	const queue = [spec.root]
	for (const key of queue) {
		const el = spec.elements[key]
		lines.push({ op: 'add', path: `/elements/${key}`, value: el })
		queue.push(...(el.children ?? []))
	}
	return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
}

export default function Lab() {
	const [messages, setMessages] = useState<Message[]>([])
	const [draft, setDraft] = useState('')
	const [busy, setBusy] = useState(false)
	const [selected, setSelected] = useState<number | null>(null)
	const [tab, setTab] = useState<Tab>('stream')
	const [speed, setSpeed] = useState(1)
	const [toast, setToast] = useState<string | null>(null)
	const nextId = useRef(0)
	const log = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const onToast = (e: Event) => {
			setToast((e as CustomEvent<string>).detail)
			setTimeout(() => setToast(null), 2000)
		}
		window.addEventListener('jr-toast', onToast)
		return () => window.removeEventListener('jr-toast', onToast)
	}, [])

	useEffect(() => {
		log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
	}, [messages])

	const patch = (id: number, next: Partial<Extract<Message, { role: 'ai' }>>) =>
		setMessages((ms) => ms.map((m) => (m.id === id && m.role === 'ai' ? { ...m, ...next } : m)))

	async function send(prompt: string) {
		if (!prompt.trim() || busy) return
		setBusy(true)
		setDraft('')
		const reply = fakeReply(prompt)
		const full = nestedToFlat(reply.tree as unknown as Record<string, unknown>)
		const id = ++nextId.current
		const store = createStateStore(full.state ?? {})
		setMessages((ms) => [
			...ms,
			{ id: ++nextId.current, role: 'user', text: prompt },
			{ id, role: 'ai', text: '', spec: null, jsonl: '', streaming: true, store },
		])
		setSelected(id)
		await sleep(400 / speed)

		// 1. "Type" the chat text.
		for (let i = 1; i <= reply.text.length; i += 3) {
			patch(id, { text: reply.text.slice(0, i) })
			await sleep(16 / speed)
		}
		patch(id, { text: reply.text })

		// 2. Stream the JSONL in small chunks through the real compiler, so the UI
		//    builds up exactly as it would from a live model.
		const jsonl = toJsonl(full)
		const compiler = createSpecStreamCompiler<Spec>({ root: '', elements: {} })
		for (let i = 0; i < jsonl.length; i += 40) {
			const { result, newPatches } = compiler.push(jsonl.slice(i, i + 40))
			patch(id, { jsonl: jsonl.slice(0, i + 40), ...(newPatches.length && { spec: { ...result, elements: { ...result.elements } } }) })
			await sleep(30 / speed)
		}
		patch(id, { streaming: false, spec: compiler.getResult() })
		setBusy(false)
	}

	const current = messages.find((m) => m.id === selected && m.role === 'ai') as Extract<Message, { role: 'ai' }> | undefined

	return (
		<div className="jr-lab">
			<section className="jr-chat" aria-label="Fake chat">
				<div className="jr-log" ref={log}>
					{messages.length === 0 && (
						<div className="jr-empty flow">
							<i className="ph ph-sparkle zui-text-5" />
							<p className="zui-color-muted">Ask for something. Replies are canned, streamed as real json-render patches, and picked at random.</p>
						</div>
					)}
					{messages.map((m) =>
						m.role === 'user' ? (
							<div key={m.id} className="jr-msg jr-msg-user">
								{m.text}
							</div>
						) : (
							<div
								key={m.id}
								className={`jr-msg jr-msg-ai flow ${m.id === selected ? 'is-selected' : ''}`}
								onClick={() => setSelected(m.id)}
							>
								<p>{m.text || <span className="jr-dots" aria-label="Thinking" />}</p>
								{m.spec?.root && (
									<JSONUIProvider registry={registry} store={m.store} handlers={actionHandlers}>
										<Renderer spec={m.spec} registry={registry} loading={m.streaming} />
									</JSONUIProvider>
								)}
							</div>
						),
					)}
				</div>

				<div className="jr-suggestions flex gap-xs">
					{scenarios.map((s) => (
						<Button key={s.id} size="sm" variant="subtle" shape="soft" disabled={busy} onClick={() => send(s.prompt)}>
							{s.prompt}
						</Button>
					))}
				</div>
				<form
					className="flex gap-xs"
					onSubmit={(e) => {
						e.preventDefault()
						send(draft)
					}}
				>
					<Input aria-label="Message" placeholder="Ask for weather, a form, a dashboard…" value={draft} onChange={(e) => setDraft(e.target.value)} />
					<Button type="submit" icon disabled={busy} aria-label="Send">
						<i className="ph ph-paper-plane-right" />
					</Button>
				</form>
			</section>

			<aside className="jr-inspector" aria-label="Inspector">
				<div className="flex items-center justify-between gap-xs">
					<div className="flex gap-2xs" role="group" aria-label="Inspector view">
						{(['stream', 'spec', 'state', 'prompt'] as Tab[]).map((t) => (
							<Button key={t} size="sm" variant={tab === t ? 'fill' : 'ghost'} aria-pressed={tab === t} onClick={() => setTab(t)}>
								{t}
							</Button>
						))}
					</div>
					<label className="flex items-center gap-2xs zui-text--1">
						Speed
						<select className="zui-select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
							<option value={0.25}>0.25×</option>
							<option value={1}>1×</option>
							<option value={4}>4×</option>
						</select>
					</label>
				</div>
				{current?.streaming && <Badge color="amber">streaming…</Badge>}
				<Pre className="jr-pre">
					<code>
						{tab === 'prompt' ? systemPrompt : !current ? 'Send a message to see its spec.' : tab === 'stream' ? current.jsonl : tab === 'spec' ? JSON.stringify(current.spec, null, 2) : <LiveState store={current.store} />}
					</code>
				</Pre>
			</aside>

			{toast && (
				<div className="jr-toast" role="status">
					{toast}
				</div>
			)}
		</div>
	)
}

function LiveState({ store }: { store: StateStore }) {
	const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
	return <>{JSON.stringify(state, null, 2)}</>
}
