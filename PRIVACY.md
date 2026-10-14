# Privacy Policy

Last updated: October 14, 2026

MostBox is an open-source, peer-to-peer application. This policy describes the
data flows implemented by the software in this repository. It does not make
peer-to-peer activity private or anonymous.

## Local data

MostBox stores node configuration, local identity material, published-file
metadata, seeding holdings, downloaded content, notes, channel state, and user
preferences on the user's device. MostBox does not operate a central account
database for the P2P file-sharing flow.

Users are responsible for protecting their device, local data directory,
credentials, recovery material, shared CIDs, and channel identifiers.

## Peer-to-peer network

When a user enables P2P features, MostBox connects to Hyperswarm bootstrap
infrastructure and other peers. Network participants and infrastructure
providers may observe information needed to establish a connection, including
IP addresses, timing, topics, and traffic volume.

Files published or seeded by a user are transferred to peers that know the
corresponding `most://` link or CID. Channel messages and presence information
are replicated to peers participating in the corresponding channel. CIDs,
`most://` links, and channel identifiers act as capabilities and should be
shared accordingly.

## Optional photos and voice messages

Camera and microphone access is requested only when the user chooses to take a
photo or record a voice message. Users can choose existing photos through the
system picker without granting access to their entire photo library. Voice
recording stops when the app leaves the foreground. Recorded voice messages can
be reviewed or cancelled before sending; cancelled recordings are removed from
the app's recording cache.

Sending a photo or voice message publishes its content as a CID-addressed file
and shares its `most://` link in the selected channel. Connected channel peers,
remote nodes selected by the user, and people who know the link can obtain this
content. Published and downloaded attachments are seeded like other files;
deleting a local copy cannot remove copies already held by independent peers.

## Optional message notifications

Mobile users can enable silent notifications for new channel messages received
while the app is in the background. The setting is off by default and system
permission is requested when enabling it. Notifications identify the channel
but do not display the message text or attachment contents. They are generated
locally from messages received by the app; this feature does not register an
Expo, FCM or APNs push token. Delivery is not guaranteed when the app is closed
or suspended by the operating system. Users can disable reminders in the app
or manage notification permissions in system settings.

## Optional Most.Box services

The application contacts `download.most.box` to check for release information.
Downloading an update sends the ordinary information associated with an HTTPS
request, such as the requesting IP address and user-agent information, to the
download host and its infrastructure providers.

Account backups are encrypted and exported to a file selected by the user. The
application does not upload account backups or avatar images to a MostBox
service. Custom avatar URLs are fetched from the host selected by the user, so
that host receives the ordinary information associated with an HTTPS request.
Private wallet or recovery material remains local. Users should review the
source and keep independent backups of important data.

## Third-party services

The Web3 toolbox connects only when used and may communicate with blockchain
RPC services selected or configured by the user. Those providers receive data
required to answer RPC requests and apply their own privacy policies.

GitHub, npm, Cloudflare, HyperDHT bootstrap operators, internet service
providers, and other infrastructure used to obtain or operate MostBox process
data under their own terms and policies.

## Telemetry

The application does not include a product analytics or advertising telemetry
system. Operational logs are produced locally. Network services may still keep
security and access logs according to their own configuration and legal
obligations.

## User choices

Users can stop P2P participation by closing the node or application, remove
local data using operating-system file controls, refrain from uploading account
backups or avatars, refrain from using Web3 tools, and stop sharing capability
links. Data already received by independent peers cannot be recalled by MostBox.

## Contact

For privacy questions, open a GitHub issue that does not contain secrets or
personal data. Report security-sensitive matters through the private process in
[SECURITY.md](SECURITY.md).
