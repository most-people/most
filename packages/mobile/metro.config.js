const path = require('path');

module.exports = {
  watchFolders: [
    // Include core package for metro to bundle
    path.resolve(__dirname, '../core'),
  ],
  resolver: {
    // Ensure metro can resolve node.js modules used by core
    extraNodeModules: {
      // Metro needs these aliases for nodejs-mobile
      stream: require.resolve('stream-browserify'),
      crypto: require.resolve('react-native-quick-crypto'),
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true, 
      },
    }),
  },
};