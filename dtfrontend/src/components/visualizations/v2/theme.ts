export const CHART_COLORS = {
  blue: '#0052A5',
  darkBlue: '#003B7A',
  green: '#2EAD68',
  orange: '#F39C12',
  red: '#E74C3C',
  purple: '#8B5CF6',
  cyan: '#06B6D4',
  muted: '#94A3B8',
  grid: '#F0F2F5',
  text: '#64748B',
} as const

export const CHART_PALETTE = [
  CHART_COLORS.blue,
  CHART_COLORS.green,
  CHART_COLORS.orange,
  CHART_COLORS.red,
  CHART_COLORS.purple,
  CHART_COLORS.cyan,
] as const

export const TONE_ACCENT = ['#0052A5', '#2EAD68', '#F39C12', '#06B6D4', '#8B5CF6', '#E74C3C'] as const
export const TONE_SOFT = ['#EAF3FF', '#e8f8f0', '#fef6e7', '#e6fbff', '#f3e8ff', '#fdecea'] as const

export function paletteOf(colors?: string[]) {
  return colors && colors.length > 0 ? colors : [...CHART_PALETTE]
}
