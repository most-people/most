const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'MostBox',
    asar: true,
    out: path.join(__dirname, '..', 'desktop-build'),
    prune: false
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {}
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32']
    }
  ]
};
