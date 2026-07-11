const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const companionCoreSource = path.resolve(
  __dirname,
  '..',
  '..',
  'packages',
  'companion-core',
  'src',
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const comesFromCompanionCore = context.originModulePath.startsWith(
    `${companionCoreSource}${path.sep}`,
  );

  // Core keeps Node ESM `.js` specifiers in TypeScript source; Metro resolves the source extension.
  if (
    comesFromCompanionCore &&
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js')
  ) {
    return context.resolveRequest(
      context,
      moduleName.slice(0, -3),
      platform,
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
