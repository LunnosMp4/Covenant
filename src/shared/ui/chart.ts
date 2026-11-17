/**
 * Semantic chart contract.
 *
 * The model supplies facts (categories, series values, unit) and never a
 * chart-library option. Everything about how the chart is drawn — axes, grid,
 * palette, tooltip, animation, accessibility — is owned by the trusted renderer.
 */

export type ChartKind = 'line' | 'area' | 'bar' | 'pie' | 'donut'

/** Presentation-only number formatting. `unit` stays free text. */
export type ChartValueFormat = 'number' | 'percent' | 'compact'

export interface ChartSeries {
  label: string
  /** `null` means "no data" and is drawn as a gap, never as zero. */
  values: Array<number | null>
  /** Draw this series as a line, bar or area regardless of the chart kind. */
  as?: 'line' | 'bar' | 'area'
  /** Plot against a second, right-hand value axis (a different unit/scale). */
  axis?: 'left' | 'right'
}

export interface ChartData {
  title: string
  description?: string
  kind: ChartKind
  categories: string[]
  series: ChartSeries[]
  unit?: string
  /** Stacked bars/areas. Ignored for line, pie and donut. */
  stacked?: boolean
  /** Category to emphasise; the rest of the chart steps back. */
  highlight?: string
  valueFormat?: ChartValueFormat
  /** Pan/zoom the category axis (line, area and bar only). */
  zoom?: boolean
  /** Plot height in CSS pixels. Clamped by the renderer. */
  height?: number
}

export const CHART_KINDS: readonly ChartKind[] = ['line', 'area', 'bar', 'pie', 'donut']

export const CHART_VALUE_FORMATS: readonly ChartValueFormat[] = ['number', 'percent', 'compact']

/** Per-series drawing form, so one chart can mix bars and a trend line. */
export const CHART_SERIES_FORMS = ['line', 'bar', 'area'] as const

export const CHART_AXES = ['left', 'right'] as const

export const CHART_LIMITS = {
  maxTitleLength: 160,
  maxDescriptionLength: 400,
  maxCategories: 48,
  maxCategoryLength: 48,
  minSeries: 1,
  maxSeries: 4,
  maxUnitLength: 24,
  minHeight: 160,
  defaultHeight: 220,
  maxHeight: 320
} as const

const COMPACT_FORMATTER = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1
})

const PLAIN_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 })

const PERCENT_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2
})

export function formatChartValue(
  value: number,
  format: ChartValueFormat = 'number'
): string {
  if (format === 'compact') return COMPACT_FORMATTER.format(value)
  if (format === 'percent') return `${PERCENT_FORMATTER.format(value)}%`
  return PLAIN_FORMATTER.format(value)
}

export function formatChartValueWithUnit(
  value: number,
  format: ChartValueFormat = 'number',
  unit?: string
): string {
  const formatted = formatChartValue(value, format)
  return unit ? `${formatted} ${unit}` : formatted
}

export function clampChartHeight(height: number | undefined): number {
  if (typeof height !== 'number' || !Number.isFinite(height)) return CHART_LIMITS.defaultHeight
  return Math.round(
    Math.min(CHART_LIMITS.maxHeight, Math.max(CHART_LIMITS.minHeight, height))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

/**
 * Returns human-readable issues. An empty array means the data is safe to draw.
 * Messages are written for the model to repair without guessing.
 */
export function validateChartData(value: unknown, path = 'chart'): string[] {
  if (!isRecord(value)) return [`${path}: expected an object`]

  const issues: string[] = []
  const { title, description, kind, categories, series, unit, stacked, highlight, valueFormat, zoom, height } =
    value

  if (!isNonEmptyString(title, CHART_LIMITS.maxTitleLength)) {
    issues.push(`${path}/title: 1-${CHART_LIMITS.maxTitleLength} characters required`)
  }

  if (description !== undefined) {
    if (typeof description !== 'string' || description.length > CHART_LIMITS.maxDescriptionLength) {
      issues.push(`${path}/description: at most ${CHART_LIMITS.maxDescriptionLength} characters`)
    }
  }

  if (typeof kind !== 'string' || !CHART_KINDS.includes(kind as ChartKind)) {
    issues.push(`${path}/kind: must be one of ${CHART_KINDS.join(', ')}`)
  }

  const safeKind = (CHART_KINDS as readonly string[]).includes(String(kind))
    ? (kind as ChartKind)
    : 'bar'

  if (!Array.isArray(categories) || categories.length === 0) {
    issues.push(`${path}/categories: at least one category required`)
  } else if (categories.length > CHART_LIMITS.maxCategories) {
    issues.push(`${path}/categories: at most ${CHART_LIMITS.maxCategories} categories`)
  } else {
    const seen = new Set<string>()
    categories.forEach((category, index) => {
      if (!isNonEmptyString(category, CHART_LIMITS.maxCategoryLength)) {
        issues.push(
          `${path}/categories/${index}: 1-${CHART_LIMITS.maxCategoryLength} characters required`
        )
        return
      }
      if (seen.has(category)) {
        issues.push(`${path}/categories/${index}: duplicate category "${category}"`)
      }
      seen.add(category)
    })
  }

  const categoryCount = Array.isArray(categories) ? categories.length : 0

  if (!Array.isArray(series)) {
    issues.push(`${path}/series: an array of series is required`)
  } else if (series.length < CHART_LIMITS.minSeries || series.length > CHART_LIMITS.maxSeries) {
    issues.push(
      `${path}/series: between ${CHART_LIMITS.minSeries} and ${CHART_LIMITS.maxSeries} series required`
    )
  } else {
    const labels = new Set<string>()
    series.forEach((entry, index) => {
      if (!isRecord(entry)) {
        issues.push(`${path}/series/${index}: expected an object`)
        return
      }
      const label = entry.label
      if (!isNonEmptyString(label, CHART_LIMITS.maxTitleLength)) {
        issues.push(`${path}/series/${index}/label: 1-${CHART_LIMITS.maxTitleLength} characters required`)
      } else if (labels.has(label)) {
        issues.push(`${path}/series/${index}/label: duplicate series label "${label}"`)
      } else {
        labels.add(label)
      }

      const values = entry.values
      if (!Array.isArray(values)) {
        issues.push(`${path}/series/${index}/values: an array is required`)
        return
      }
      if (values.length !== categoryCount) {
        issues.push(
          `${path}/series/${index}/values: ${values.length} values for ${categoryCount} categories (they must align)`
        )
      }
      values.forEach((point, pointIndex) => {
        if (point !== null && !isFiniteNumber(point)) {
          issues.push(
            `${path}/series/${index}/values/${pointIndex}: use a finite number, or null for missing data`
          )
        }
      })

      if (entry.as !== undefined) {
        if (!(CHART_SERIES_FORMS as readonly string[]).includes(String(entry.as))) {
          issues.push(`${path}/series/${index}/as: must be one of ${CHART_SERIES_FORMS.join(', ')}`)
        } else if (safeKind === 'pie' || safeKind === 'donut') {
          issues.push(`${path}/series/${index}/as: not supported for ${safeKind} charts`)
        }
      }

      if (entry.axis !== undefined) {
        if (!(CHART_AXES as readonly string[]).includes(String(entry.axis))) {
          issues.push(`${path}/series/${index}/axis: must be one of ${CHART_AXES.join(', ')}`)
        } else if (safeKind === 'pie' || safeKind === 'donut') {
          issues.push(`${path}/series/${index}/axis: not supported for ${safeKind} charts`)
        }
      }
    })
  }

  if (unit !== undefined) {
    if (typeof unit !== 'string' || unit.length > CHART_LIMITS.maxUnitLength) {
      issues.push(`${path}/unit: at most ${CHART_LIMITS.maxUnitLength} characters`)
    }
  }

  if (stacked !== undefined && typeof stacked !== 'boolean') {
    issues.push(`${path}/stacked: expected a boolean`)
  }

  if (valueFormat !== undefined && !CHART_VALUE_FORMATS.includes(valueFormat as ChartValueFormat)) {
    issues.push(`${path}/valueFormat: must be one of ${CHART_VALUE_FORMATS.join(', ')}`)
  }

  if (height !== undefined && !isFiniteNumber(height)) {
    issues.push(`${path}/height: expected a number of pixels`)
  }

  if (zoom !== undefined && typeof zoom !== 'boolean') {
    issues.push(`${path}/zoom: expected a boolean`)
  }

  if (highlight !== undefined) {
    if (typeof highlight !== 'string' || !Array.isArray(categories) || !categories.includes(highlight)) {
      issues.push(`${path}/highlight: must match one of the categories`)
    }
  }

  if (safeKind === 'pie' || safeKind === 'donut') {
    if (Array.isArray(series)) {
      if (series.length !== 1) {
        issues.push(`${path}/series: a ${safeKind} chart needs exactly one series`)
      }
      const only = series[0]
      if (isRecord(only) && Array.isArray(only.values)) {
        const values = only.values
        if (values.some((point) => point === null)) {
          issues.push(`${path}/series/0/values: a ${safeKind} chart cannot contain missing values`)
        }
        if (values.some((point) => isFiniteNumber(point) && point < 0)) {
          issues.push(`${path}/series/0/values: a ${safeKind} chart cannot contain negative values`)
        }
        if (values.every((point) => point === 0)) {
          issues.push(`${path}: a ${safeKind} chart needs at least one non-zero value`)
        }
      }
    }
    if (stacked === true) {
      issues.push(`${path}/stacked: not supported for ${safeKind} charts`)
    }
    if (zoom === true) {
      issues.push(`${path}/zoom: not supported for ${safeKind} charts`)
    }
  }

  return issues
}

/**
 * Compact plain-text rendering used for the accessibility label, the model's
 * memory of an earlier visual, chat search, and the renderer fallback.
 */
export function describeChart(chart: ChartData, maxPoints = 24): string {
  const parts: string[] = []
  const format = chart.valueFormat ?? 'number'
  const unit = chart.unit ? ` ${chart.unit}` : ''
  const kindLabel = chart.kind === 'donut' ? 'donut' : chart.kind

  parts.push(`Chart "${chart.title}" (${kindLabel}${chart.unit ? `, ${chart.unit}` : ''})`)

  if (chart.kind === 'pie' || chart.kind === 'donut') {
    const series = chart.series[0]
    if (series) {
      const pairs = chart.categories.slice(0, maxPoints).map((category, index) => {
        const value = series.values[index]
        return `${category} ${value === null ? 'no data' : `${formatChartValue(value, format)}${unit}`}`
      })
      parts.push(pairs.join(', '))
    }
    return parts.join('. ')
  }

  parts.push(`categories: ${chart.categories.slice(0, maxPoints).join(', ')}`)

  for (const series of chart.series) {
    const points = series.values.slice(0, maxPoints).map((value, index) => {
      const category = chart.categories[index] ?? `#${index + 1}`
      return `${category} ${value === null ? 'no data' : `${formatChartValue(value, format)}${unit}`}`
    })
    parts.push(`${series.label}: ${points.join(', ')}`)
  }

  return parts.join('. ')
}

export interface ChartTheme {
  palette: string[]
  text: string
  muted: string
  grid: string
  border: string
  surface: string
  fontFamily: string
  fontSize: number
  radius: number
  dark: boolean
}

/** Used when a CSS-token palette is unavailable (SSR, or a theme mid-swap). */
export const CHART_FALLBACK_PALETTE = [
  '#8FA3B8',
  '#B39A82',
  '#8FAF9A',
  '#A99BBB',
  '#B7A87F',
  '#93AFB5'
]

function paletteFor(theme: ChartTheme, count: number): string[] {
  const palette = theme.palette.length > 0 ? theme.palette : CHART_FALLBACK_PALETTE
  return Array.from({ length: count }, (_, index) => palette[index % palette.length])
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const normalized =
      color.length === 4
        ? color
            .slice(1)
            .split('')
            .map((char) => char + char)
            .join('')
        : color.slice(1)
    const value = Number.parseInt(normalized, 16)
    if (Number.isFinite(value)) {
      const r = (value >> 16) & 255
      const g = (value >> 8) & 255
      const b = value & 255
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }
  return color
}

/**
 * Semantic data → ECharts option. Deliberately small: the widget supports the
 * shapes an answer actually needs, not ECharts' feature surface.
 */
export function buildChartOption(
  chart: ChartData,
  theme: ChartTheme
): Record<string, unknown> {
  const format = chart.valueFormat ?? 'number'
  const primary = theme.palette[0] ?? CHART_FALLBACK_PALETTE[0]
  const colors = paletteFor(theme, Math.max(1, chart.series.length))
  const showLegend = chart.series.length > 1 && chart.kind !== 'pie' && chart.kind !== 'donut'
  const highlightColor = withAlpha(primary, 0.1)

  const valueFormatter = (value: unknown): string =>
    typeof value === 'number'
      ? formatChartValueWithUnit(value, format, chart.unit)
      : String(value ?? '')

  const tooltip: Record<string, unknown> = {
    trigger: chart.kind === 'pie' || chart.kind === 'donut' ? 'item' : 'axis',
    confine: true,
    renderMode: 'html',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    padding: [6, 9],
    textStyle: {
      color: theme.text,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize
    },
    extraCssText: `border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,${theme.dark ? 0.4 : 0.12}); backdrop-filter: blur(10px);`,
    valueFormatter,
    axisPointer: {
      type: chart.kind === 'bar' ? 'shadow' : 'line',
      lineStyle: { color: theme.border, width: 1, type: 'solid' },
      shadowStyle: { color: withAlpha(theme.text, 0.04) }
    }
  }

  if (chart.kind === 'pie' || chart.kind === 'donut') {
    const series = chart.series[0]
    return {
      color: colors,
      tooltip: {
        ...tooltip,
        trigger: 'item',
        formatter: (params: unknown) => {
          const entry = params as { name?: string; value?: number }
          const value =
            typeof entry.value === 'number'
              ? formatChartValueWithUnit(entry.value, format, chart.unit)
              : ''
          return `${entry.name ?? ''}: ${value}`.trim()
        }
      },
      series: [
        {
          name: series?.label ?? chart.title,
          type: 'pie',
          radius: chart.kind === 'donut' ? ['48%', '72%'] : ['0%', '68%'],
          center: ['50%', '48%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: theme.surface,
            borderWidth: 2,
            borderRadius: theme.radius
          },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 4,
            label: {
              show: true,
              formatter: `{b}\n{c}${chart.unit ? ` ${chart.unit}` : ''}`,
              color: theme.text,
              fontFamily: theme.fontFamily,
              fontSize: theme.fontSize,
              fontWeight: 600,
              lineHeight: theme.fontSize * 1.5
            }
          },
          data: chart.categories.map((category, index) => ({
            name: category,
            value: series?.values[index] ?? 0
          }))
        }
      ]
    }
  }

  const showZoom = chart.zoom === true && (chart.kind === 'line' || chart.kind === 'area' || chart.kind === 'bar')
  const useRightAxis = chart.series.some((entry) => entry.axis === 'right')
  const highlightIndex = chart.highlight ? chart.categories.indexOf(chart.highlight) : -1

  const formOf = (entry: ChartSeries): 'line' | 'bar' | 'area' => {
    if (entry.as) return entry.as
    if (chart.kind === 'bar') return 'bar'
    if (chart.kind === 'area') return 'area'
    return 'line'
  }

  const valueAxis: Record<string, unknown> = {
    type: 'value',
    ...(chart.unit ? { name: chart.unit, nameGap: 14 } : {}),
    nameTextStyle: {
      color: theme.muted,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      align: 'left'
    },
    splitNumber: 4,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: theme.muted,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      margin: 8,
      formatter: (value: number) =>
        format === 'compact' || Math.abs(value) >= 10_000
          ? formatChartValue(value, 'compact')
          : formatChartValue(value, format)
    },
    splitLine: {
      lineStyle: { color: theme.grid, type: 'dashed', width: 1 }
    }
  }

  // A second axis for a series in a different unit; its gridlines would double
  // up with the left axis, so they stay hidden.
  const rightAxis: Record<string, unknown> = {
    ...valueAxis,
    name: undefined,
    position: 'right',
    splitLine: { show: false }
  }

  const series = chart.series.map((entry, seriesIndex) => {
    const color = colors[seriesIndex] ?? colors[0]
    const form = formOf(entry)
    const stacked = chart.stacked === true && (form === 'bar' || form === 'area')
    const base: Record<string, unknown> = {
      name: entry.label,
      type: form === 'bar' ? 'bar' : 'line',
      yAxisIndex: entry.axis === 'right' ? 1 : 0,
      data: entry.values,
      connectNulls: false,
      ...(stacked ? { stack: 'total' } : {}),
      itemStyle:
        form === 'bar'
          ? {
              color,
              borderRadius: [theme.radius, theme.radius, 0, 0]
            }
          : { color },
      barMaxWidth: 26,
      emphasis: { focus: 'series' },
      symbol: 'circle',
      symbolSize: 5,
      showSymbol: false,
      smooth: form === 'bar' ? false : 0.22,
      lineStyle: { width: 2, color },
      ...(form === 'area'
        ? {
            areaStyle: {
              color: withAlpha(color, 0.16),
              opacity: 1
            }
          }
        : {}),
      ...(highlightIndex >= 0
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: highlightColor },
              label: { show: false },
              data: [[{ xAxis: chart.categories[highlightIndex] }, { xAxis: chart.categories[highlightIndex] }]]
            }
          }
        : {})
    }
    return base
  })

  return {
    color: colors,
    tooltip,
    ...(showLegend
      ? {
          legend: {
            type: 'scroll',
            bottom: showZoom ? 20 : 0,
            left: 'center',
            icon: 'circle',
            itemWidth: 8,
            itemHeight: 8,
            itemGap: 14,
            pageIconSize: 9,
            pageTextStyle: { color: theme.muted, fontSize: theme.fontSize - 1 },
            textStyle: {
              color: theme.muted,
              fontFamily: theme.fontFamily,
              fontSize: theme.fontSize,
              fontWeight: 500
            }
          }
        }
      : {}),
    grid: {
      left: 2,
      right: 10,
      top: 26,
      bottom: (showLegend ? 34 : 6) + (showZoom ? 22 : 0),
      // ECharts 6 replacement for the deprecated `containLabel` (which needs the
      // `LegacyGridContainLabel` feature and logs a warning without it).
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel'
    },
    xAxis: {
      type: 'category',
      data: chart.categories,
      boundaryGap: chart.kind === 'bar',
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: theme.muted,
        fontFamily: theme.fontFamily,
        fontSize: theme.fontSize,
        margin: 10,
        hideOverlap: true,
        interval: 'auto'
      }
    },
    yAxis: useRightAxis ? [valueAxis, rightAxis] : valueAxis,
    ...(showZoom
      ? {
          dataZoom: [
            { type: 'inside', xAxisIndex: [0], minValueSpan: 2, throttle: 50 },
            {
              type: 'slider',
              xAxisIndex: [0],
              height: 14,
              bottom: 0,
              borderColor: 'transparent',
              backgroundColor: 'transparent',
              fillerColor: withAlpha(primary, 0.18),
              handleStyle: { color: theme.muted, borderColor: theme.border },
              moveHandleStyle: { color: theme.border },
              dataBackground: {
                lineStyle: { color: theme.grid },
                areaStyle: { color: withAlpha(theme.grid, 0.6) }
              },
              selectedDataBackground: {
                lineStyle: { color: withAlpha(primary, 0.6) },
                areaStyle: { color: withAlpha(primary, 0.18) }
              },
              textStyle: { color: theme.muted, fontSize: theme.fontSize - 1 },
              showDetail: false,
              brushSelect: false
            }
          ]
        }
      : {}),
    series
  }
}
