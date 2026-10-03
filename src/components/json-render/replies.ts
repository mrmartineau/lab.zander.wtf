// Canned "AI" replies. Each scenario has a few variants; one is picked at
// random so asking twice gives a different UI, like a real model would.
// Written as nested trees for readability, flattened by nestedToFlat().

type Node = {
	type: string
	props?: Record<string, unknown>
	children?: Node[]
	on?: Record<string, unknown>
	visible?: unknown
	state?: Record<string, unknown>
}

export type Reply = { text: string; tree: Node }
export type Scenario = { id: string; prompt: string; keywords: string[]; replies: Reply[] }

const h = (type: string, props: Record<string, unknown> = {}, ...children: Node[]): Node => ({ type, props, children })
const toast = (message: string) => ({ press: { action: 'toast', params: { message } } })

const weather = (city: string, temp: string, icon: string, summary: string, days: [string, string, string][]) =>
	h(
		'Card',
		{ title: city, description: 'Today' },
		h('Stack', { direction: 'row', gap: 'md' }, h('Icon', { name: icon, size: '5' }), h('Stack', { gap: '2xs' }, h('Text', { text: temp, size: '4' }), h('Text', { text: summary, muted: true }))),
		h('Grid', { min: '5rem', gap: 'xs' }, ...days.map(([d, i, t]) => h('Stack', { gap: '2xs' }, h('Text', { text: d, size: '-1', muted: true }), h('Icon', { name: i }), h('Text', { text: t })))),
	)

export const scenarios: Scenario[] = [
	{
		id: 'weather',
		prompt: 'What’s the weather like?',
		keywords: ['weather', 'rain', 'sun', 'forecast', 'temperature'],
		replies: [
			{
				text: 'Here’s the forecast for London.',
				tree: weather('London', '14°', 'cloud-rain', 'Light rain, clearing later', [['Thu', 'cloud-sun', '16°'], ['Fri', 'sun', '19°'], ['Sat', 'cloud', '15°'], ['Sun', 'cloud-lightning', '12°']]),
			},
			{
				text: 'Lisbon looks lovely this week.',
				tree: weather('Lisbon', '24°', 'sun', 'Clear skies all day', [['Thu', 'sun', '25°'], ['Fri', 'sun', '26°'], ['Sat', 'cloud-sun', '23°'], ['Sun', 'sun', '24°']]),
			},
			{
				text: 'Bit chilly in Reykjavík.',
				tree: weather('Reykjavík', '2°', 'snowflake', 'Snow showers, strong wind', [['Thu', 'wind', '1°'], ['Fri', 'snowflake', '-2°'], ['Sat', 'cloud', '0°'], ['Sun', 'cloud-snow', '-1°']]),
			},
		],
	},
	{
		id: 'signup',
		prompt: 'Make me a sign-up form',
		keywords: ['form', 'sign', 'signup', 'register', 'login', 'newsletter'],
		replies: [
			{
				text: 'A simple sign-up form. The fields are bound to state, so watch the inspector as you type.',
				tree: {
					...h(
						'Card',
						{ title: 'Create an account', description: 'It takes 30 seconds.' },
						h('Input', { label: 'Name', value: { $bindState: '/form/name' }, placeholder: 'Ada Lovelace' }),
						h('Input', { label: 'Email', type: 'email', value: { $bindState: '/form/email' }, placeholder: 'ada@example.com' }),
						h('Select', { label: 'Plan', value: { $bindState: '/form/plan' }, options: ['Hobby', 'Pro', 'Team'] }),
						h('Checkbox', { label: 'Send me the newsletter', checked: { $bindState: '/form/newsletter' } }),
						{ ...h('Text', { text: { $template: 'Welcome aboard, ${/form/name}!' }, muted: true }), visible: { $state: '/form/name' } },
						{ ...h('Button', { label: 'Sign up', icon: 'arrow-right' }), on: toast('Signed up (not really)') },
					),
					state: { form: { name: '', email: '', plan: 'Pro', newsletter: true } },
				},
			},
			{
				text: 'Here’s a minimal newsletter box.',
				tree: {
					...h(
						'Card',
						{ title: 'The Friday email', description: 'One link a week. No spam.' },
						h('Stack', { direction: 'row', gap: 'xs' }, h('Input', { label: 'Email', type: 'email', value: { $bindState: '/email' }, placeholder: 'you@example.com' })),
						{ ...h('Button', { label: 'Subscribe', variant: 'outline', icon: 'envelope' }), on: toast('Subscribed!') },
					),
					state: { email: '' },
				},
			},
		],
	},
	{
		id: 'dashboard',
		prompt: 'Show me a sales dashboard',
		keywords: ['dashboard', 'sales', 'stats', 'metrics', 'revenue', 'analytics'],
		replies: [
			{
				text: 'Here are this month’s numbers.',
				tree: h(
					'Stack',
					{ gap: 'md' },
					h('Heading', { text: 'September sales' }),
					h('Grid', { min: '9rem' }, h('Card', {}, h('Stat', { label: 'Revenue', value: '£48.2k', delta: '12%', trend: 'up' })), h('Card', {}, h('Stat', { label: 'Orders', value: '1,204', delta: '3%', trend: 'up' })), h('Card', {}, h('Stat', { label: 'Refunds', value: '38', delta: '9%', trend: 'down' }))),
					h('Card', { title: 'Top products' }, h('Table', { columns: ['Product', 'Units', 'Revenue'], rows: [['Mechanical keyboard', '312', '£24,960'], ['Desk mat', '540', '£10,800'], ['USB-C hub', '221', '£7,735']] })),
				),
			},
			{
				text: 'Quarter to date, against targets.',
				tree: h(
					'Card',
					{ title: 'Q3 targets', description: 'Two weeks left' },
					h('Progress', { label: 'Revenue', value: 82 }),
					h('Progress', { label: 'New customers', value: 64 }),
					h('Progress', { label: 'Churn reduction', value: 97 }),
					h('Stack', { direction: 'row', gap: 'xs', wrap: true }, h('Badge', { label: 'On track', color: 'green' }), h('Badge', { label: '1 at risk', color: 'amber' })),
				),
			},
		],
	},
	{
		id: 'todo',
		prompt: 'Help me plan my day',
		keywords: ['todo', 'plan', 'day', 'tasks', 'list', 'checklist'],
		replies: [
			{
				text: 'Tick things off as you go. The count updates from state.',
				tree: {
					...h(
						'Card',
						{ title: 'Thursday', description: 'Three things. That’s plenty.' },
						h('Checkbox', { label: 'Reply to recruiter emails', checked: { $bindState: '/done/0' } }),
						h('Checkbox', { label: 'Ship the lab experiment', checked: { $bindState: '/done/1' } }),
						h('Checkbox', { label: 'Go for a walk', checked: { $bindState: '/done/2' } }),
						{ ...h('Badge', { label: 'Walk done — nice', color: 'green' }), visible: { $state: '/done/2' } },
					),
					state: { done: [false, false, false] },
				},
			},
			{
				text: 'A time-boxed version.',
				tree: h(
					'Card',
					{ title: 'Time blocks' },
					h('Table', { columns: ['Time', 'Block'], rows: [['09:00', 'Deep work'], ['11:00', 'Emails'], ['13:00', 'Lunch + walk'], ['14:00', 'Calls'], ['16:00', 'Wrap up']] }),
					{ ...h('Button', { label: 'Add to calendar', variant: 'subtle', icon: 'calendar-plus' }), on: toast('Added to calendar (pretend)') },
				),
			},
		],
	},
	{
		id: 'pricing',
		prompt: 'Compare pricing plans',
		keywords: ['price', 'pricing', 'plan', 'plans', 'cost', 'compare'],
		replies: [
			{
				text: 'Three plans, side by side.',
				tree: h(
					'Grid',
					{ min: '12rem' },
					...[
						['Hobby', '£0', 'For tinkering', 'gray', ['1 project', 'Community support']],
						['Pro', '£12', 'For side projects', 'violet', ['10 projects', 'Custom domains', 'Email support']],
						['Team', '£49', 'For companies', 'blue', ['Unlimited projects', 'SSO', 'Priority support']],
					].map(([name, price, desc, color, features]) =>
						h(
							'Card',
							{ title: name as string, description: desc as string },
							h('Stack', { direction: 'row', gap: 'xs' }, h('Text', { text: price as string, size: '4' }), h('Text', { text: '/ month', muted: true })),
							...(features as string[]).map((f) => h('Stack', { direction: 'row', gap: 'xs' }, h('Icon', { name: 'check', size: '0' }), h('Text', { text: f }))),
							name === 'Pro' ? h('Badge', { label: 'Most popular', color: color as string }) : h('Text', { text: ' ', size: '-1' }),
							{ ...h('Button', { label: `Choose ${name}`, variant: name === 'Pro' ? 'fill' : 'outline' }), on: toast(`You picked ${name}`) },
						),
					),
				),
			},
			{
				text: 'Here it is as a table instead.',
				tree: h('Card', { title: 'Plan comparison' }, h('Table', { columns: ['', 'Hobby', 'Pro', 'Team'], rows: [['Price', '£0', '£12', '£49'], ['Projects', '1', '10', '∞'], ['Custom domain', '—', '✓', '✓'], ['SSO', '—', '—', '✓']] })),
			},
		],
	},
]

export const fallback: Reply[] = [
	{
		text: 'I’m a fake model, so I only know a few tricks. Try one of these:',
		tree: h('Stack', { direction: 'row', gap: 'xs', wrap: true }, ...scenarios.map((s) => h('Badge', { label: s.prompt, color: 'gray' }))),
	},
]

/** Pick a scenario by keyword; unknown prompts get the fallback. */
export function fakeReply(prompt: string): Reply {
	const words = prompt.toLowerCase()
	const hit = scenarios.find((s) => s.keywords.some((k) => words.includes(k)))
	const pool = hit?.replies ?? fallback
	return pool[Math.floor(Math.random() * pool.length)]
}
