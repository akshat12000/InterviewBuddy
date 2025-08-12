/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#dceefe',
          200: '#bfe0fd',
          300: '#93c9fb',
          400: '#5ca8f7',
          500: '#2b89f2',
          600: '#176fde',
          700: '#1458b2',
          800: '#154a8e',
          900: '#163f73',
        },
      },
      boxShadow: {
        card: '0 10px 30px -10px rgba(0,0,0,0.25)'
      }
    },
  },
  plugins: [],
}
