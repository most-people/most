const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'Most Box',
    // icon: path.join(__dirname, 'assets', 'icon'),
    asar: true,
    // macOS signing (uncomment and configure for production)
    // osxSign: {},
    // osxNotarize: {
    //   tool: 'notarytool',
    //   appleId: process.env.APPLE_ID,
    //   appleIdPassword: process.env.APPLE_PASSWORD,
    //   teamId: process.env.APPLE_TEAM_ID,
    // },
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'ULFO'
      }
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'MostBox',
        authors: 'Most Box',
        description: 'Most Box - Cross-platform P2P file sharing application',
        // setupIcon: path.join(__dirname, 'assets', 'icon.ico')
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux']
    }
  ]
};