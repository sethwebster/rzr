const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');
const { exclusionList } = require('metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const config = getDefaultConfig(projectRoot);

config.resolver.blockList = exclusionList([
  // Block bun workspace symlinks that alias back into watched dirs
  new RegExp(`${escapeRegExp(path.join(monorepoRoot, 'node_modules', '@sethwebster', 'rzr-mobile'))}\\/.*`),
  new RegExp(`${escapeRegExp(path.join(monorepoRoot, 'node_modules', '@sethwebster', 'rzr'))}\\/.*`),
  new RegExp(`${escapeRegExp(path.join(monorepoRoot, 'node_modules', '@sethwebster', 'rzr-cloudflare'))}\\/.*`),
  // Native build dirs
  new RegExp(`${escapeRegExp(path.join(projectRoot, 'ios'))}\\/.*`),
  new RegExp(`${escapeRegExp(path.join(projectRoot, 'android'))}\\/.*`),
  new RegExp(`${escapeRegExp(path.join(projectRoot, 'dist'))}\\/.*`),
]);

module.exports = withNativewind(config, {
  input: './global.css',
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
