/**
 * Keep junction paths as-is when resolving modules (same as the Nest build's
 * `preserveSymlinks: true`). Without this, a spec run via api/src/<module>/…
 * resolves imports to the real module (m-<name>/server) path and relative cross-module
 * imports such as `../../common/station/...` stop existing.
 */
module.exports = (request, options) =>
  options.defaultResolver(request, { ...options, symlinks: false });
