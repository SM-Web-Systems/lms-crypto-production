const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// This repository uses separate lockfiles rather than package-manager workspaces.
// Include the dependency-free presentation helper shared with the web client.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../LMS-Frontend/src')];
// Transformed sibling code must resolve against the pinned native dependencies.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  ...(config.resolver.nodeModulesPaths ?? []),
];

module.exports = withNativeWind(config, { input: './src/global.css' });
