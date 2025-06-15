export default {
  plugins: {
    // CHANGE THIS LINE:
    // From: tailwindcss: {},
    // To: require('@tailwindcss/postcss'): {},
    // Or, more modern ESM style (which Vite prefers):
    '@tailwindcss/postcss': {}, // Use the correct plugin package name
    autoprefixer: {},
  },
}
