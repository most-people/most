# Equal Toolbox Home Design

## Goal

Refactor the MostBox home page and related product copy from a chat-first entry model to an equal-weight toolbox model.

The home page should present Files, Chat, Knowledge Base, Games, and Web3 as peer product entries. No single feature should be described as the required starting path. The page should stay minimal, refined, and useful as a product overview.

## Success Criteria

- The home page no longer defaults to Chat as the primary or selected feature.
- Files, Chat, Knowledge Base, Games, and Web3 appear with equal visual weight and direct entry actions.
- The removed large dynamic marketing panel is replaced by a compact, static toolbox overview.
- Product copy no longer says users should start from chat.
- Knowledge Base is described as an independent notes and local knowledge tool.
- Chat settings no longer offer "save chat history to Knowledge Base".
- File sharing protocol invariants remain unchanged: `most://`, CID verification, and seeding after download still work as before.
- Web3 remains an independent toolbox entry and is not a prerequisite for file sharing.

## New Product Positioning

MostBox is a direct user-to-user P2P toolbox. Its main user-facing entries are:

- Files: publish files, share `most://` links, verify by CID, and keep seeding after download.
- Chat: create or join rooms and sync messages through P2P Channels.
- Knowledge Base: maintain Markdown notes, folders, privacy mode, and local knowledge organization.
- Games: open standalone game rooms that reuse the shared Channel system.
- Web3: use independent key, wallet, and address tools.

These entries are peers. Chat can still carry attachments, and games can still reuse Channels internally, but those implementation relationships should not make Chat the product's first path.

## Home Page Design

Use the approved "equal toolbox" direction from the visual companion:

- Header: keep the existing marketing header controls, including appearance toggle, language toggle, download client button outside desktop runtime, and account menu.
- Hero: use `MOST PEOPLE` as the headline. Supporting copy explains the product as a direct P2P toolbox with peer entries.
- Primary actions: use Download Client, Connect Node, and Node Admin. These are global operational actions, not feature-specific actions.
- Feature matrix: show five peer modules for Files, Chat, Knowledge Base, Games, and Web3. Each module has an icon, title, short description, status when relevant, and direct open action.
- Status band: keep a compact node/runtime note. Web connects to existing nodes; desktop provides full P2P capability.
- Mobile layout: stack the headline, global actions, and five feature modules in one column. Text must remain compact and not overflow.

The old dynamic selected-feature detail section should be removed. Users should not need to click a card to reveal a second explanatory block.

## Chat And Knowledge Base Boundary

Chat settings should keep room details, members, room ID, remark editing, created time, and leave-room actions.

Chat settings should remove:

- the Knowledge Base save section,
- the save-all chat history button,
- chat-to-note draft creation from the chat page,
- user-facing chat copy that suggests saving chat history to Knowledge Base.

The Knowledge Base page can keep its own note creation, editing, privacy, folder, search, and vault behavior. Existing `chatDraft` import code may be removed if it is no longer reachable and no other feature depends on it. If removing it would create unnecessary blast radius, it may be left dormant only if there is no visible chat entry and docs/tests no longer advertise it.

## Documentation Impact

Update current facts in the project documentation:

- `README.md`: remove "chat-first" positioning and rewrite the opening summary as an equal toolbox.
- `docs/acceptance.md`: replace the "chat-first MVP" language with equal toolbox acceptance while keeping the file protocol regression as the hard MVP protocol check.
- `docs/mobile-android-alpha.md`: keep historical dated records intact, but avoid new current-positioning language that claims chat-first if touched.

## Test Impact

Update focused smoke tests that currently assert chat-first behavior or chat-to-note saving:

- Home page tests should assert peer feature entries and no dynamic chat-first detail requirement.
- Chat settings tests should assert that the Knowledge Base save action is absent.
- I18n tests should assert no visible current product copy says "chat-first" or "start with chat" in the home page catalog.
- Existing protocol tests should remain unchanged unless a test name or documentation assertion references the old product strategy.

For implementation verification, run:

- `npm run test:frontend`
- `npm run typecheck`
- `npm run typecheck:strict-router`
- `npm run lint`

If implementation only changes frontend and docs, protocol tests are not required, but file protocol copy must not be weakened.

## Out Of Scope

- No protocol changes.
- No backend route changes.
- No changes to `most://` link format, CID generation, CID topic derivation, Hyperdrive path rules, or seeding behavior.
- No new cloud storage, payment, order, bounty, or permanent availability promises.
- No new chat-to-note replacement flow.
