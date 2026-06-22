import backendBundle from '../../app.bundle.js'
import { BareWorkletMostBoxCore } from './workletClient'
import type { MostBoxMobileCore } from './types'

type CreateMostBoxCoreOptions = {
  storagePath: string
}

export function createMostBoxCore({
  storagePath,
}: CreateMostBoxCoreOptions): MostBoxMobileCore {
  return new BareWorkletMostBoxCore({
    bundle: backendBundle,
    storagePath,
  })
}
