import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import packageJson from '../../../package.json' with { type: 'json' }

const PAGE_SCHEMA = {
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50),
}

function hasScope(principal, scope) {
  return principal?.scopes?.includes(scope) === true
}

function paginate(items, offset, limit) {
  const values = Array.isArray(items) ? items : []
  return {
    items: values.slice(offset, offset + limit),
    offset,
    limit,
    total: values.length,
    hasMore: offset + limit < values.length,
  }
}

function toolResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

function toolError(err) {
  const data = {
    error: err instanceof Error ? err.message : String(err),
    code: err?.code || 'MCP_TOOL_ERROR',
    ...(err?.errorCode ? { errorCode: err.errorCode } : {}),
    ...(err?.details ? { details: err.details } : {}),
  }
  return { ...toolResult(data), isError: true }
}

function registerTool(server, name, config, handler) {
  server.registerTool(name, config, async input => {
    try {
      return toolResult(await handler(input))
    } catch (err) {
      return toolError(err)
    }
  })
}

function registerJsonResource(server, name, uri, description, loader) {
  server.registerResource(
    name,
    uri,
    {
      title: name,
      description,
      mimeType: 'application/json',
      cacheHint: { ttlMs: 2_000, cacheScope: 'private' },
    },
    async resourceUri => ({
      contents: [
        {
          uri: resourceUri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await loader(), null, 2),
        },
      ],
    })
  )
}

export function createMostBoxMcpServer({ client, principal }) {
  const server = new McpServer(
    { name: 'most-box', version: packageJson.version },
    {
      instructions:
        'MostBox is CID-first P2P file sharing. Treat CID as content identity. ' +
        'Downloading verifies the UnixFS CID before saving and then seeds automatically. ' +
        'File names and paths are display metadata, not integrity evidence.',
    }
  )

  if (hasScope(principal, 'node:read')) {
    registerJsonResource(
      server,
      'MostBox node status',
      'mostbox://node/status',
      'Current node, network, capacity, and seeding summary.',
      () => client.getNodeStatus()
    )
    registerJsonResource(
      server,
      'MostBox holdings',
      'mostbox://holdings',
      'Complete CID replicas currently held by this node.',
      async () => paginate(await client.listHoldings(), 0, 100)
    )

    registerTool(
      server,
      'mostbox_node_status',
      {
        title: 'Read MostBox node status',
        description: 'Read node, network, capacity, and seeding status.',
        inputSchema: z.object({}),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      () => client.getNodeStatus()
    )
    registerTool(
      server,
      'mostbox_list_holdings',
      {
        title: 'List MostBox holdings',
        description: 'List complete CID replicas and their topic join state.',
        inputSchema: z.object(PAGE_SCHEMA),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ offset, limit }) =>
        paginate(await client.listHoldings(), offset, limit)
    )
  }

  if (hasScope(principal, 'files:read')) {
    registerJsonResource(
      server,
      'MostBox files',
      'mostbox://files',
      'Current user file metadata. File content is not included.',
      async () => paginate(await client.listFiles(), 0, 100)
    )
    registerJsonResource(
      server,
      'MostBox downloads',
      'mostbox://downloads',
      'Current user active download tasks.',
      async () => ({ items: await client.listDownloads() })
    )

    registerTool(
      server,
      'mostbox_list_files',
      {
        title: 'List MostBox files',
        description:
          'List the current user file metadata without file content.',
        inputSchema: z.object(PAGE_SCHEMA),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ offset, limit }) =>
        paginate(await client.listFiles(), offset, limit)
    )
    registerTool(
      server,
      'mostbox_check_download',
      {
        title: 'Check a MostBox download',
        description:
          'Validate a most:// link or CID and check local or online availability without downloading content.',
        inputSchema: z.object({
          link: z.string().min(1).max(4096),
          timeout: z.number().int().min(100).max(30_000).optional(),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      input => client.checkDownload(input)
    )
    registerTool(
      server,
      'mostbox_get_share_link',
      {
        title: 'Get a MostBox share link',
        description:
          'Return the canonical most:// link for a current user file CID.',
        inputSchema: z.object({ cid: z.string().min(1).max(256) }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ cid }) => {
        const file = (await client.listFiles()).find(item => item.cid === cid)
        if (!file) {
          const error = new Error('CID is not in the current user file library')
          error.code = 'FILE_NOT_FOUND'
          throw error
        }
        return { cid: file.cid, fileName: file.fileName, link: file.link }
      }
    )
    registerTool(
      server,
      'mostbox_list_downloads',
      {
        title: 'List MostBox downloads',
        description: 'List active download tasks for the current user.',
        inputSchema: z.object({}),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => ({ items: await client.listDownloads() })
    )
  }

  if (hasScope(principal, 'files:publish')) {
    registerTool(
      server,
      'mostbox_publish_local_file',
      {
        title: 'Publish a local file with MostBox',
        description:
          'Publish a regular file on the MostBox daemon host. The real path must be under a directory allowed for this MCP client.',
        inputSchema: z.object({
          path: z.string().min(1).max(4096),
          fileName: z.string().min(1).max(255).optional(),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      input => client.publishLocalFile(input)
    )
  }

  if (hasScope(principal, 'files:download')) {
    registerTool(
      server,
      'mostbox_start_download',
      {
        title: 'Download with MostBox',
        description:
          'Start a CID-verified download. Successful content is saved to the user library and seeded automatically.',
        inputSchema: z.object({
          link: z.string().min(1).max(4096),
          selectedPaths: z
            .array(z.string().min(1).max(1024))
            .max(500)
            .optional(),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      input => client.startDownload(input)
    )
  }

  if (hasScope(principal, 'downloads:cancel')) {
    registerTool(
      server,
      'mostbox_cancel_download',
      {
        title: 'Cancel a MostBox download',
        description:
          'Cancel an active download task owned by the current user.',
        inputSchema: z.object({
          taskId: z.string().min(1).max(128),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      ({ taskId }) => client.cancelDownload(taskId)
    )
  }

  return server
}
