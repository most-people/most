const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'Most Box',
    asar: true,
    afterCopy: [
      async (buildPath, electronVersion, platform, arch) => {
        const fs = require('fs');
        const src = path.join(__dirname, '..', 'core');
        const dest = path.join(buildPath, 'app', 'node_modules', '@most-box', 'core');
        fs.cpSync(src, dest, { recursive: true });
      }
    ]
  }
};
