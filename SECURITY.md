# Security Policy

## Supported versions

Security fixes are provided for the latest released version of MostBox. Users
should update to the latest release before reporting an issue that may already
have been fixed.

## Reporting a vulnerability

Do not open a public issue for an undisclosed vulnerability, exposed secret,
signing-key concern, or release-pipeline compromise.

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/most-people/most/security/advisories/new>

Include the affected version, impact, reproduction steps, and any suggested
mitigation. Do not include real private keys, recovery phrases, private files,
or credentials. The maintainers will acknowledge the report, investigate it,
and coordinate disclosure according to severity and available fixes.

## Release integrity

Official releases are published through the repository's GitHub Actions release
workflow. Windows artifacts are considered code-signed only when they carry a
valid Authenticode signature as described in
[CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md).

If a published artifact, checksum, signature, or download mirror appears
inconsistent, stop using it and report it privately.
