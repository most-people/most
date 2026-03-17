import crypto from 'bare-crypto';

export default crypto;
export const {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  pbkdf2,
  pbkdf2Sync,
  timingSafeEqual,
  constants,
  webcrypto
} = crypto;
