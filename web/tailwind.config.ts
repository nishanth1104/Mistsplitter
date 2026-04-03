import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        smoky:    '#462C55',
        royal:    '#704786',
        amethyst: '#8D5FA5',
        lavender: '#A977BF',
        pale:     '#E3C4E9',
      },
    },
  },
  plugins: [],
}

export default config
