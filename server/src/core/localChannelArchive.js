// An upgrade snapshots only the v1 blocks already on this node. Never open
// these writers in the v2 replication runtime or feed their data to its index.
export async function snapshotLocalChannelArchive(channel, openCore, write) {
  const messages = []
  for (const key of channel.legacyWriterCoreKeys) {
    if (!/^[0-9a-f]{64}$/.test(key)) continue
    const core = openCore(key)
    try {
      await core.ready()
      const length = core.length
      for (let index = 0; index < length; index++) {
        const entry = await core.get(index, { wait: false })
        if (entry === null) break
        if (
          entry?.type !== 'message' ||
          entry.v !== undefined ||
          typeof entry.content !== 'string' ||
          !entry.content ||
          !Number.isSafeInteger(entry.timestamp) ||
          entry.timestamp < 0
        )
          continue
        messages.push({
          type: 'legacy',
          id: `legacy:${messages.length}`,
          author: 'legacy',
          authorName: String(entry.authorName || entry.author || '—').slice(
            0,
            100
          ),
          content: entry.content,
          timestamp: entry.timestamp,
          // A cursor identifies a position in this snapshot, not a v1 writer.
          _coreKey: '0'.repeat(64),
          _index: messages.length,
        })
      }
    } finally {
      await core.close()
    }
  }
  write(JSON.stringify(messages))
}
