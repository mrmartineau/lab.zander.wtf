import { defineCatalog } from '@json-render/core'
import { defineRegistry, useBoundProp } from '@json-render/react'
import { schema } from '@json-render/react/schema'
import {
	Badge,
	Button,
	Card,
	CardBody,
	CardDescription,
	CardHeader,
	CardTitle,
	Checkbox,
	Input,
	Label,
	Select,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@mrmartineau/zui/react'
import { useId } from 'react'
import { z } from 'zod'

const gap = z.enum(['2xs', 'xs', 'sm', 'md', 'lg']).nullable()
const badgeColor = z
	.enum(['default', 'green', 'amber', 'red', 'blue', 'violet', 'gray'])
	.nullable()

// The catalog is the contract: the only components + props an AI may use.
export const catalog = defineCatalog(schema, {
	components: {
		Stack: {
			props: z.object({ direction: z.enum(['row', 'column']).nullable(), gap, wrap: z.boolean().nullable() }),
			description: 'Flex layout container',
		},
		Grid: {
			props: z.object({ min: z.string().nullable(), gap }),
			description: 'Responsive auto-fit grid. `min` is the min column width, e.g. "10rem"',
		},
		Card: {
			props: z.object({ title: z.string().nullable(), description: z.string().nullable() }),
			description: 'Panel with optional title and description',
		},
		Heading: {
			props: z.object({ text: z.string(), level: z.enum(['1', '2', '3']).nullable() }),
			description: 'Heading text',
		},
		Text: {
			props: z.object({ text: z.string(), muted: z.boolean().nullable(), size: z.enum(['-1', '0', '1', '4']).nullable() }),
			description: 'Paragraph of text',
		},
		Icon: {
			props: z.object({ name: z.string(), size: z.enum(['0', '2', '5']).nullable() }),
			description: 'Phosphor icon, e.g. "sun", "cloud-rain"',
		},
		Badge: {
			props: z.object({ label: z.string(), color: badgeColor }),
			description: 'Small status label',
		},
		Stat: {
			props: z.object({ label: z.string(), value: z.string(), delta: z.string().nullable(), trend: z.enum(['up', 'down', 'flat']).nullable() }),
			description: 'Metric with label and optional change',
		},
		Progress: {
			props: z.object({ label: z.string(), value: z.number() }),
			description: 'Progress bar, value 0–100',
		},
		Button: {
			props: z.object({ label: z.string(), variant: z.enum(['fill', 'outline', 'ghost', 'subtle']).nullable(), icon: z.string().nullable() }),
			description: 'Button. Bind `on.press` to an action',
		},
		Input: {
			props: z.object({ label: z.string(), value: z.string().nullable(), placeholder: z.string().nullable(), type: z.string().nullable() }),
			description: 'Text input. Use $bindState on value',
		},
		Checkbox: {
			props: z.object({ label: z.string(), checked: z.boolean().nullable() }),
			description: 'Checkbox. Use $bindState on checked',
		},
		Select: {
			props: z.object({ label: z.string(), value: z.string().nullable(), options: z.array(z.string()) }),
			description: 'Dropdown. Use $bindState on value',
		},
		Table: {
			props: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.string())) }),
			description: 'Simple data table',
		},
	},
	actions: {
		toast: { params: z.object({ message: z.string() }), description: 'Show a short message to the user' },
	},
})




export const { registry, handlers } = defineRegistry(catalog, {
	components: {
		Stack: ({ props, children }) => (
			<div
				className={`flex ${props.direction === 'row' ? 'flex-row items-center' : 'flex-column'} gap-${props.gap ?? 'sm'}`}
				style={{ flexWrap: props.wrap ? 'wrap' : undefined }}
			>
				{children}
			</div>
		),
		Grid: ({ props, children }) => (
			<div className={`jr-grid gap-${props.gap ?? 'sm'}`} style={{ '--jr-min': props.min ?? '10rem' } as React.CSSProperties}>
				{children}
			</div>
		),
		Card: ({ props, children }) => (
			<Card>
				{(props.title || props.description) && (
					<CardHeader>
						{props.title && <CardTitle>{props.title}</CardTitle>}
						{props.description && <CardDescription>{props.description}</CardDescription>}
					</CardHeader>
				)}
				<CardBody className="flow">{children}</CardBody>
			</Card>
		),
		Heading: ({ props }) => {
			const Tag = `h${props.level ?? '2'}` as 'h2'
			return <Tag className={`zui-text-${{ 1: 4, 2: 2, 3: 1 }[props.level ?? '2']}`}>{props.text}</Tag>
		},
		Text: ({ props }) => (
			<p className={`zui-text-${props.size ?? 'base'} ${props.muted ? 'zui-color-muted' : ''}`}>{props.text}</p>
		),
		Icon: ({ props }) => <i className={`ph ph-${props.name} zui-text-${props.size ?? '2'}`} aria-hidden="true" />,
		Badge: ({ props }) => <Badge color={props.color ?? 'default'}>{props.label}</Badge>,
		Stat: ({ props }) => (
			<div className="jr-stat">
				<span className="zui-text--1 zui-color-muted">{props.label}</span>
				<strong className="zui-text-3">{props.value}</strong>
				{props.delta && (
					<span className={`zui-text--1 jr-trend-${props.trend ?? 'flat'}`}>
						<i className={`ph ph-trend-${props.trend === 'down' ? 'down' : 'up'}`} /> {props.delta}
					</span>
				)}
			</div>
		),
		Progress: ({ props }) => (
			<div className="flex flex-column gap-2xs">
				<div className="flex justify-between zui-text--1">
					<span>{props.label}</span>
					<span className="zui-color-muted">{props.value}%</span>
				</div>
				<progress className="jr-progress" max={100} value={props.value} />
			</div>
		),
		Button: ({ props, emit }) => (
			<Button variant={props.variant ?? 'fill'} onClick={() => emit('press')}>
				{props.icon && <i className={`ph ph-${props.icon}`} />} {props.label}
			</Button>
		),
		Input: ({ props, bindings }) => {
			const [value, setValue] = useBoundProp(props.value, bindings?.value)
			const id = useId()
			return (
				<div className="zui-field">
					<Label htmlFor={id}>{props.label}</Label>
					<Input id={id} type={props.type ?? 'text'} placeholder={props.placeholder ?? ''} value={value ?? ''} onChange={(e) => setValue(e.target.value)} />
				</div>
			)
		},
		Checkbox: ({ props, bindings }) => {
			const [checked, setChecked] = useBoundProp(props.checked, bindings?.checked)
			return (
				<Checkbox checked={!!checked} onChange={(e) => setChecked(e.currentTarget.checked)}>
					{props.label}
				</Checkbox>
			)
		},
		Select: ({ props, bindings }) => {
			const [value, setValue] = useBoundProp(props.value, bindings?.value)
			const id = useId()
			return (
				<div className="zui-field">
					<Label htmlFor={id}>{props.label}</Label>
					<Select id={id} value={value ?? ''} onChange={(e) => setValue(e.target.value)}>
						{props.options.map((o) => (
							<option key={o}>{o}</option>
						))}
					</Select>
				</div>
			)
		},
		Table: ({ props }) => (
			<Table>
				<TableHeader>
					<TableRow>
						{props.columns.map((c) => (
							<TableHead key={c}>{c}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{props.rows.map((row, i) => (
						<TableRow key={i}>
							{row.map((cell, j) => (
								<TableCell key={j}>{cell}</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		),
	},
	actions: {
		toast: async (params) => {
			window.dispatchEvent(new CustomEvent('jr-toast', { detail: params?.message }))
		},
	},
})
