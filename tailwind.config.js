/** @type {import('tailwindcss').Config} */
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`

module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        white: withOpacity('--ui-fg'),
        neutral: {
          50: withOpacity('--n-50'),
          100: withOpacity('--n-100'),
          200: withOpacity('--n-200'),
          300: withOpacity('--n-300'),
          400: withOpacity('--n-400'),
          500: withOpacity('--n-500'),
          600: withOpacity('--n-600'),
          700: withOpacity('--n-700'),
          800: withOpacity('--n-800'),
          900: withOpacity('--n-900'),
          950: withOpacity('--n-950')
        }
      }
    }
  },
  plugins: []
}
