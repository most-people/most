import { MockMostBoxCore } from './mockCore'
import type { MostBoxMobileCore } from './types'

type CreateMostBoxCoreOptions = {
  storagePath: string
}

export function createMostBoxCore(
  _options: CreateMostBoxCoreOptions
): MostBoxMobileCore {
  return new MockMostBoxCore()
}
