import { createLoginSession } from '~server/src/utils/userIdentity.js'
import type { ChatJoinInvitePayload } from '~/lib/chatJoinInvite'

export async function createChatJoinInviteIdentity(
  invite: ChatJoinInvitePayload
) {
  const { identity, danger } = await createLoginSession(invite.uid, '')
  return {
    identity: {
      ...identity,
      theme: invite.theme,
      displayName: invite.name || identity.displayName,
      logo: invite.logo,
      logo_dark: invite.logo_dark,
      data: invite.data,
      avatar: invite.avatar,
      tag: invite.tag,
    },
    danger,
  }
}
