/** @type {import('tailwindcss').Config} */
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`

const ramp = (prefix) => {
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
  return Object.fromEntries(shades.map((shade) => [shade, withOpacity(`--${prefix}-${shade}`)]))
}

module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{ts,tsx}',
    // Theme presets live in shared code so the main process can migrate them.
    './src/shared/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // Flips between dark and light so hairline/white utilities follow the mode.
        white: withOpacity('--ui-fg'),
        neutral: ramp('n'),
        // Mode-aware semantic ramps. Keep the hue aliases for existing call sites;
        // new code should prefer the semantic names.
        success: ramp('success'),
        warning: ramp('warning'),
        danger: ramp('danger'),
        emerald: ramp('success'),
        amber: ramp('warning'),
        red: ramp('danger')
      }
    }
  },
  plugins: []
}
