const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add platform-specific extensions for web
config.resolver.sourceExts.push('web.ts', 'web.tsx', 'web.js', 'web.jsx');

// Exclude Next.js API routes from Metro bundling (they're server-side only)
config.resolver.blockList = [/app\/api\/.*/, /node_modules\/next\/.*/];

module.exports = config;
