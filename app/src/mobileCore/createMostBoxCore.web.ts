import { MobileNodeClient } from './mobileClient'
import type { MostBoxMobileClient } from './types'

type CreateMostBoxCoreOptions = {
  storagePath: string
}

export function createMostBoxCore({
  storagePath,
}: CreateMostBoxCoreOptions): MostBoxMobileClient {
  return new MobileNodeClient({ bundle: '', storagePath, remoteOnly: true })
}
