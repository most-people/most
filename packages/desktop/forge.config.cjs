const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'Most Box',
    asar: true,
    out: path.join(__dirname, '..', 'desktop-build')
  }
};
