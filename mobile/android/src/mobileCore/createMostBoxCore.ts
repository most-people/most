import backendBundle from '../../app.bundle.js'
import { MockMostBoxCore } from './mockCore'
import { BareWorkletMostBoxCore } from './workletClient'
import type { MostBoxMobileCore } from './types'

type CreateMostBoxCoreOptions = {
  storagePath: string
}

export function createMostBoxCore({
  storagePath,
}: CreateMostBoxCoreOptions): MostBoxMobileCore {
  return backendBundle
    ? new BareWorkletMostBoxCore({
        bundle: backendBundle,
        storagePath,
      })
    : new MockMostBoxCore()
}
