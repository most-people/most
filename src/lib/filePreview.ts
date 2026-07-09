export type FileSubtype = 'image' | 'video' | 'audio' | 'text' | 'file'

export function getFileSubtype(fileName: string): FileSubtype {
  const ext =
    String(fileName || '')
      .split('.')
      .pop()
      ?.toLowerCase() || ''
  const imgExts = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'svg',
    'bmp',
    'ico',
    'tiff',
    'heic',
    'heif',
  ]
  const vidExts = [
    'mp4',
    'webm',
    'mov',
    'avi',
    'mkv',
    'flv',
    'wmv',
    'm4v',
    'mpeg',
    '3gp',
  ]
  const audExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus']
  const txtExts = [
    'txt',
    'md',
    'js',
    'ts',
    'jsx',
    'tsx',
    'css',
    'scss',
    'less',
    'json',
    'xml',
    'html',
    'htm',
    'yaml',
    'yml',
    'toml',
    'ini',
    'cfg',
    'conf',
    'log',
    'sh',
    'bash',
    'py',
    'rb',
    'go',
    'rs',
    'java',
    'c',
    'cpp',
    'h',
    'hpp',
    'cs',
    'php',
    'sql',
    'graphql',
    'env',
    'gitignore',
    'dockerfile',
    'readme',
  ]

  if (imgExts.includes(ext)) return 'image'
  if (vidExts.includes(ext)) return 'video'
  if (audExts.includes(ext)) return 'audio'
  if (txtExts.includes(ext)) return 'text'
  return 'file'
}
