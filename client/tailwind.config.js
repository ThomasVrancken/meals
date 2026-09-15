/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FFF8F0',
        paper: '#FFFDF9',
        tomato: {
          50: '#FFF2EE',
          100: '#FFE1D6',
          200: '#FFC2AC',
          300: '#FF9C7A',
          400: '#FB7A50',
          500: '#EF5A2C',
          600: '#D8441C',
          700: '#B13618',
          800: '#8C2D17',
          900: '#722818',
        },
        basil: {
          50: '#F1F8EE',
          100: '#DFEED7',
          500: '#5B8C4A',
          600: '#496F3B',
        },
        ink: {
          50: '#F7F5F2',
          100: '#EDE8E1',
          400: '#8A8078',
          500: '#6B6259',
          600: '#544C45',
          700: '#3E3833',
          800: '#2B2622',
          900: '#1E1A17',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(43, 38, 34, 0.06), 0 4px 16px rgba(43, 38, 34, 0.06)',
        sheet: '0 -4px 24px rgba(43, 38, 34, 0.12)',
      },
      animation: {
        'slide-up': 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.15s ease-out',
        'pop': 'pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce-dot': 'bounceDot 1.2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceDot: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.5' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
