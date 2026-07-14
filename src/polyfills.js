// Compatibility polyfills — see src/compat/ for platform detection and the
// modern vs legacy (webOS 1–3 / webOS 2) split. This file remains the single
// import used by src/index.js so the rest of the app does not depend on
// where polyfills live.
import './compat/polyfills';
