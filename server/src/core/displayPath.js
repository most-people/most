export function getPathBaseName(fileName) {
  const parts = String(fileName || '')
    .split('/')
    .filter(Boolean)
  return parts[parts.length - 1] || 'unnamed_file'
}

export function getDisplayPathFolder(fileName) {
  const parts = String(fileName || '')
    .split('/')
    .filter(Boolean)
  parts.pop()
  return parts.join('/')
}
