# Code signing policy

MostBox release artifacts are built from the public
[`most-people/most`](https://github.com/most-people/most) repository by GitHub
Actions on GitHub-hosted runners.

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

## Scope

The SignPath Foundation certificate is used only for official MostBox Windows
release artifacts produced from this repository. It is not used for local,
pull-request, nightly, third-party, or modified builds.

A release is represented as signed only when its Authenticode signature is
present and valid. Until the SignPath integration is approved and enabled,
Windows artifacts remain unsigned and operating systems may show an unknown
publisher warning.

## Team roles

- Committers and reviewers:
  [@seateam](https://github.com/seateam) and
  [@ye4u](https://github.com/ye4u)
- Release approver and GitHub organization owner:
  [@seateam](https://github.com/seateam)

All team members with repository or signing access must use multi-factor
authentication for GitHub and SignPath. A maintainer does not approve their own
security-sensitive changes when another maintainer is available.

## Change control

Changes to release workflows, build scripts, dependencies, packaging, this
policy, or SignPath configuration require review by another maintainer. Official
releases are created from version tags after the repository's release checks
pass.

SignPath origin verification must bind a signing request to the repository,
workflow run, commit, and GitHub-hosted build artifact. The release workflow
must fail instead of publishing a Windows artifact when signing or signature
verification fails.

## Privacy

MostBox network and data behavior is documented in the
[Privacy Policy](PRIVACY.md). MostBox is a P2P application and therefore
transfers information to networked systems when users operate its network,
update, cloud, or Web3 features.

## Reporting concerns

Report a suspected signing-policy violation or compromised release through the
private process in [SECURITY.md](SECURITY.md). SignPath-related abuse may also
be reported to `support@signpath.io`.
