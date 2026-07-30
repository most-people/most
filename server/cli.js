#!/usr/bin/env node
import { main } from './index.js'

if (process.argv[2] === 'mcp') {
  const { runMcpStdio } = await import('./src/mcp/stdio.js')
  runMcpStdio().catch(err => {
    console.error(`[MostBox MCP] ${err.message}`)
    process.exit(1)
  })
} else {
  main()
}
