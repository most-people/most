import backendBundle from '../../appBundle'
import { MobileNodeClient } from './mobileClient'
import type { MostBoxMobileClient } from './types'

type CreateMostBoxCoreOptions = {
  storagePath: string
}

export function createMostBoxCore({
  storagePath,
}: CreateMostBoxCoreOptions): MostBoxMobileClient {
  return new MobileNodeClient({
    bundle: backendBundle,
    storagePath,
  })
}
