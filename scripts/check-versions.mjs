import fs from 'node:fs'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readMatch(filePath, pattern, label) {
  const match = fs.readFileSync(filePath, 'utf8').match(pattern)
  if (!match) throw new Error(`Could not find ${label} in ${filePath}`)
  return match[1]
}

function getTagArgument() {
  const index = process.argv.indexOf('--tag')
  return index === -1
    ? process.env.GITHUB_REF_NAME || ''
    : process.argv[index + 1]
}

const rootPackageLock = readJson('package-lock.json')
const mobilePackageLock = readJson('mobile/app/package-lock.json')
const rootVersion = readJson('package.json').version
const versions = new Map([
  [
    'CHANGELOG.md latest release',
    readMatch(
      'CHANGELOG.md',
      /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\](?: - \d{4}-\d{2}-\d{2})?$/m,
      'latest changelog release version'
    ),
  ],
  ['package-lock.json', rootPackageLock.version],
  ['package-lock.json packages root', rootPackageLock.packages?.['']?.version],
  ['mobile/app/package.json', readJson('mobile/app/package.json').version],
  ['mobile/app/package-lock.json', mobilePackageLock.version],
  [
    'mobile/app/package-lock.json packages root',
    mobilePackageLock.packages?.['']?.version,
  ],
  ['mobile/app/app.json', readJson('mobile/app/app.json').expo.version],
  [
    'docker-compose.example.yml',
    readMatch(
      'docker-compose.example.yml',
      /image:\s+ghcr\.io\/most-people\/most-box:([^\s]+)/,
      'Docker image version'
    ),
  ],
  [
    'README.md',
    readMatch(
      'README.md',
      /image:\s+ghcr\.io\/most-people\/most-box:([^\s]+)/,
      'Docker image version'
    ),
  ],
])

const mismatches = [...versions].filter(
  ([, version]) => version !== rootVersion
)
if (mismatches.length > 0) {
  const details = mismatches
    .map(([filePath, version]) => `${filePath}: ${version}`)
    .join('\n')
  throw new Error(
    `Expected version ${rootVersion} in every release file:\n${details}`
  )
}

const tag = getTagArgument()
if (tag) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`)
  }
  if (tag.slice(1) !== rootVersion) {
    throw new Error(
      `Release tag ${tag} does not match package version ${rootVersion}`
    )
  }
}

console.log(`Version check passed: ${rootVersion}${tag ? ` (${tag})` : ''}`)
