// Ambient module declarations for the innopay app.

// react-toastify ships its stylesheet at this path, but under
// `moduleResolution: "bundler"` TS can't resolve the side-effect CSS import via the
// package's `exports` map (TS2882) — even though Next/webpack resolves it fine at
// build time. Declaring the module satisfies the type-checker without affecting
// Next's own typed `*.module.css` handling.
declare module 'react-toastify/dist/ReactToastify.css';
