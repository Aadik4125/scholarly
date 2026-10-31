import { loadFont as loadAnton } from '@remotion/google-fonts/Anton'
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat'

// Same palette and type as the website (src/index.css, light theme).
export const colors = {
  paper: '#fbf7ec',
  paperLine: '#e6dfc8',
  surface: '#fffdf7',
  surfaceHover: '#f3ecd8',
  ink: '#16140f',
  ink2: '#4a453c',
  inkMuted: '#8e8777',
  yellow: '#f6d753',
  pink: '#f3a0ab',
  green: '#a6e3af',
  blue: '#a3d2f6',
  purple: '#d2b3f3',
  peach: '#f5c38f',
}

export const fonts = {
  display: loadAnton().fontFamily,
  hand: loadCaveat().fontFamily,
  serif: "'Times New Roman', Times, serif",
}

export const FPS = 30

export const cardShadow = '6px 8px 0 rgba(22, 20, 15, 0.14), 0 4px 18px rgba(22, 20, 15, 0.06)'
export const popShadow = '4px 4px 0 rgba(22, 20, 15, 0.85)'
