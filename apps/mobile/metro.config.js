const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativewind(config, {
  input: './global.css',
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
