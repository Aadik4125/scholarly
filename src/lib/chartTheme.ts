export interface ChartPalette {
  cat1: string
  cat2: string
  cat3: string
  grid: string
  axis: string
  inkMuted: string
  inkSecondary: string
  surface: string
  good: string
  warning: string
  critical: string
}

const shared = {
  cat1: '#4f8fcf', // deeper sticky-blue, readable as a line
  cat2: '#d98f45', // deeper sticky-peach
  cat3: '#9a6fd9', // deeper sticky-purple
  good: '#4f9d5c',
  warning: '#caa92e',
  critical: '#d9697a',
}

const light: ChartPalette = {
  ...shared,
  grid: '#e6dfc8',
  axis: '#c9c0a5',
  inkMuted: '#8e8777',
  inkSecondary: '#4a453c',
  surface: '#fffdf7',
}

const dark: ChartPalette = {
  ...shared,
  grid: '#262315',
  axis: '#3a3523',
  inkMuted: '#948c77',
  inkSecondary: '#cbc4b0',
  surface: '#1c1a12',
}

export function getChartPalette(theme: 'light' | 'dark'): ChartPalette {
  return theme === 'dark' ? dark : light
}
