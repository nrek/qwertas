# Security policy

## Supported versions

QWERTAS is currently an active prototype without a stable public release line. Security fixes are applied to the
latest code on `main`. Older commits, locally shared builds, and unofficial packages are not maintained.

When versioned releases begin, this section will identify the supported release series.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion, pull request, or social post.

Use GitHub's private vulnerability reporting for
[`nrek/qwertas`](https://github.com/nrek/qwertas/security/advisories/new). If that form is unavailable, email
[`me@nrek.co`](mailto:me@nrek.co?subject=QWERTAS%20security%20report) with `QWERTAS security report` in the
subject line.

Include:

- the affected commit or version;
- the operating system and architecture;
- a clear description of the impact;
- reproducible steps or a minimal proof of concept;
- relevant logs, screenshots, or crash output with secrets and personal data removed;
- any suggested mitigation, if known.

Reports will be acknowledged and assessed on a best-effort basis. Please allow time for validation and a
coordinated fix before public disclosure.

## Security model

QWERTAS is a local Electron application. It has no backend, account system, telemetry service, remote-control
surface, or bundled cloud integration.

The renderer is sandboxed and context-isolated. Filesystem access exposed to the renderer is limited to validated
preload operations for importing text scores and saving recordings. The Electron main process owns file dialogs,
path validation, packaged resources, and disk writes.

This model does not make QWERTAS a hardened security boundary. The application:

- runs with the permissions of the signed-in desktop user;
- processes user-selected `.qwertas` and text files;
- writes user-requested audio and JSON recording files;
- depends on Electron, Chromium, Node.js, React, and other third-party packages;
- may send audio to an output device selected through operating-system and Chromium capabilities.

Only open scores from sources you trust, review release provenance, and keep the operating system and application
dependencies current.

## Release integrity

Current desktop exports are unsigned and unnotarized. Until signed releases and checksums are published, source
builds are the authoritative distribution method. Official release artifacts, when available, will be published
through <https://github.com/nrek/qwertas/releases>.
