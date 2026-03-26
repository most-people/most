const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'MostBox',
    asar: true,
    out: path.join(__dirname, 'build-output'),
    prune: false,
    overwrite: true,
    extraResource: [],
    ignore: [
      /^\/out/,
      /^\/build-output/,
      /^\/forge\.config\.cjs$/,
      /^\/builder\.config\.cjs$/
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ]
};
