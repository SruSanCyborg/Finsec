// PostCSS config (CommonJS) — Next 14.2 dev resolves this more reliably than
// the .mjs variant under pnpm's virtual store.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
