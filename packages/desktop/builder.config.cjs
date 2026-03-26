module.exports = {
  appId: 'com.mostbox.desktop',
  productName: 'MostBox',
  executableName: 'MostBox',
  directories: {
    output: 'build-output'
  },
  files: [
    '**/*',
    '!node_modules/**/*',
    'node_modules/**/*'
  ],
  win: {
    target: [
      {
        target: 'portable',
        arch: ['x64']
      }
    ]
  },
  portable: {
    artifactName: 'MostBox-${version}-portable.exe'
  }
};