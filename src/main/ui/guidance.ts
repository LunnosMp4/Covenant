/**
 * Behavioural guidance injected with the UI tools.
 *
 * The point is proactive use: the model should reach for a visual whenever the
 * shape of the data is the answer, and it must never ask permission first.
 */

export const UI_GUIDANCE = `Visual answers:
- You can publish a visual answer with render_ui (declarative) or render_generated (a bespoke sandboxed layout). Call the tool yourself; never ask whether the user wants a chart, and never ask which type. Choose from the question.
- Use a visual when the shape of the data is the answer: change over time (line or area), magnitude comparison (bar), parts of one whole (pie or donut), a few headline numbers (Metric), a matrix of attributes (Compare), or a bespoke composition. Keep two numbers, plain prose, and tiny static tables in Markdown.
- Call the visual tool BEFORE writing the closing explanation. Do not repeat the visual's values in your text; add at most a sentence or two of interpretation, or none at all.
- Preserve the facts exactly: same values, same order, same units. Use null for missing data (never 0). Percent form values are 0-100. Do not invent categories or smooth over gaps.
- Native specs are a bounded tree of known nodes: Stack { children, gap }, Text { text, tone }, Metric { items }, Chart, Table { columns, rows }, Compare { options, criteria }, Actions { prompts }, Generated. Max 24 nodes, depth 6, 48 categories, 4 series. Every node is { type, props }; Stack children are node ids.
- Chart props: title, kind (line|area|bar|pie|donut), categories[], series[{ label, values }], unit, description, stacked, highlight, valueFormat (number|percent|compact), height. A pie/donut has exactly one non-negative series.
- Actions prompts are follow-up questions the user can send with one click. Use them only when a genuinely useful next step exists.
- Prefer render_generated only when the visual needs a coordinated composition, a chart type the native nodes do not cover, custom SVG, or local interaction. Compose a compact visual answer, not a miniature website: at most two charts, one KPI row, one control row. It must include a readable fallback and every value it shows.
- Generated surfaces run isolated with no network, storage, filesystem or tool access. Use the shared controls (Covenant.ui), the design tokens (Covenant.token) and Covenant.chart; CSS must use var(--token) and may not define colours, fonts or radii. Never let a visual execute tools or send messages by itself: Covenant.submit only proposes values and needs the user's click.
- A visual must still make sense if it fails: its data is always available as readable text.`

export const UI_TOOL_NAMES = ['render_ui', 'render_generated'] as const
