export function decodeUnknownFileText(bytes: ArrayBuffer): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    // Keep tabs and line breaks, but reject binary control characters.
    for (const character of text) {
      const code = character.charCodeAt(0)
      if (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
        code === 127
      )
        return null
    }
    return text
  } catch {
    return null
  }
}
