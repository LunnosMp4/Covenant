/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderColor: {
        'white/8': 'rgba(255,255,255,0.08)'
      },
      colors: {
        'white/8': 'rgba(255,255,255,0.08)'
      }
    }
  },
  plugins: []
}
