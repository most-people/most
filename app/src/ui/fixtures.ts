import type { MobileHolding, MobileTransfer } from '../mobileCore/types'

const FIXTURE_CID =
  'bafkreigh2akiscaildcf7w2zj3h2p2v6x3v6e7x4v5j4m5h6g7f8d9c0b1'

export const fixtureHoldings: MobileHolding[] = [
  {
    cid: FIXTURE_CID,
    fileName: '产品需求说明.pdf',
    kind: 'file',
    size: 2_400_000,
    status: 'active',
    topicJoined: true,
    peerCount: 3,
    source: 'downloaded',
    shareLink: `most://${FIXTURE_CID}?filename=product-spec.pdf`,
    localAvailable: true,
  },
  {
    cid: `${FIXTURE_CID.slice(0, -1)}2`,
    fileName: '设计资源包.zip',
    kind: 'file',
    size: 18_700_000,
    status: 'joining',
    topicJoined: false,
    peerCount: 1,
    source: 'published',
    shareLink: `most://${FIXTURE_CID.slice(0, -1)}2?filename=design.zip`,
    localAvailable: true,
  },
]

export const fixtureTransfers: MobileTransfer[] = [
  {
    id: 'fixture-transfer-1',
    kind: 'download',
    status: 'running',
    fileName: '团队资料.zip',
    cid: FIXTURE_CID,
    progress: 68,
    totalBytes: 12_000_000,
    completedBytes: 8_160_000,
    message: '正在从在线节点接收',
    phase: 'downloading',
  },
]
