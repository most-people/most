const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'MostBox',
    asar: true,
    out: path.join(__dirname, 'build-output'),
    prune: false,
    overwrite: true
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ]
};
