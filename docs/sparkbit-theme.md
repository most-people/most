# SparkBit Chat Theme

SparkBit theme is a customer-specific `/chat` visual customization. It is only enabled when the current user identity has `theme === 'sparkbit'`.

This theme is not part of the MostBox file-sharing protocol, P2P channel protocol, or long-term product positioning. It should be treated as a removable customer integration layer.

## Current Behavior

- Applies only to the `/chat` page for SparkBit invite users.
- Uses SparkBit brand color `#6A60FF`.
- Makes the chat UI flat: no shadows, gradients, glow, or glass blur.
- Uses circular avatars in the SparkBit chat surface.
- Keeps MostBox core chat, channel, file-sharing, seeding, and Web3 toolbox behavior unchanged.

## Code Entry Points

- `src/features/chat/ChatPage.tsx`
  - Adds `sparkbit-chat-layout` when `userIdentity.theme === 'sparkbit'`.
  - Passes `sparkbit-chat-action-menu` to portal-rendered chat menus.
- `src/components/ChatUi.tsx`
  - Allows channel and attachment menus to receive theme-specific menu class names.
- `src/styles/chat.css`
  - Contains the scoped `SparkBit Chat Theme` CSS block.
- `src/tests/chat-sparkbit-style.test.js`
  - Guards the SparkBit class wiring and flat visual constraints.

## Removal Checklist

If SparkBit cooperation is cancelled and the theme is no longer needed:

1. Remove SparkBit class wiring from `src/features/chat/ChatPage.tsx`.
2. Remove `menuClassName` / `attachmentMenuClassName` plumbing from `src/components/ChatUi.tsx` if no other portal menu theme needs it.
3. Delete the `SparkBit Chat Theme` CSS block from `src/styles/chat.css`.
4. Delete `src/tests/chat-sparkbit-style.test.js`.
5. Review and remove SparkBit invite support only if it is no longer needed:
   - `src/lib/chatJoinInvite.ts`
   - `src/stores/userStore.ts`
   - `src/lib/chatJoinTestData.js`
   - `src/features/chat/ChatJoinDemoPage.tsx`
6. Run frontend checks:
   - `npm run test:frontend`
   - `npm run typecheck`
   - `npm run lint`
