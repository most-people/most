import backendBundle from '../../appBundle'
import { MobileNodeClient } from './mobileClient'
import { PRODUCT_PROFILE } from '../product/productProfile'
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
    remoteEnabled: PRODUCT_PROFILE.features.remoteNode,
  })
}
