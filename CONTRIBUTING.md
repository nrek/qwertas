# Contributing to QWERTAS

QWERTAS is an experimental musical instrument with timing-sensitive audio, keyboard input, and desktop packaging.
Contributions should preserve those boundaries and remain small enough to test and review.

## Before opening a change

- Search existing issues and pull requests for related work.
- Use an issue to discuss large behavior changes, new dependencies, file-format changes, or changes to keyboard
  mappings.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Do not include generated build output, packaged applications, recordings, credentials, or private user data.

## Development setup

Requirements:

- Node.js 22 or newer
- npm
- Windows, macOS, or Linux with a graphical desktop and audio output

```bash
git clone https://github.com/nrek/qwertas.git
cd qwertas
npm ci
npm run dev
```

The renderer runs on `http://127.0.0.1:3277` and is loaded by Electron. Press a key or click the audio gate before
testing sound.

## Project boundaries

The main paths have distinct responsibilities:

- `electron/` owns desktop lifecycle, file dialogs, validated IPC, packaged resources, and smoke automation.
- `src/audio/` owns the Web Audio graph, voices, buses, effects, output selection, and quality settings.
- `src/keyboard/` resolves physical keyboard activity into live performance input.
- `src/mappings/` defines layouts, profiles, layers, and pure key-to-action resolution.
- `src/performance/` holds canonical musical events and the shared performer path.
- `src/loops/`, `src/text/`, and `src/learn/` schedule through the shared transport and performer.
- `src/ui/` presents state; it should not become a second audio or mapping engine.

Keep these invariants intact:

1. Live, text, learning, and loops use the same canonical performance path.
2. Stored or scheduled music must not change pitch when the live keyboard layout changes.
3. One transport clock schedules text, loops, count-in, and metronome activity.
4. The renderer does not receive arbitrary filesystem access.
5. Audio starts from direct user input and remains responsive during React rendering.
6. Reducing the active loop-track count must not silently delete retained session content.

## Validation

Run the full local gate before submitting a pull request:

```bash
npm test
npm run typecheck
npm run build
```

For changes that affect keyboard input, audio, IPC, loops, text playback, learning, recording, or packaged
resources, also run:

```bash
npm run test:smoke
```

Review the generated smoke artifacts under `tests/artifacts/`, but do not commit them.

Desktop packages must be built on their matching operating system:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

A contribution does not need to build all three packages unless it changes distribution behavior. State exactly
which operating systems and package formats you tested.

## Coding expectations

- Follow the existing TypeScript and React style.
- Prefer pure functions for mapping, timing, parsing, and event transformation.
- Add focused tests for behavior changes and regressions.
- Avoid new runtime dependencies unless they materially simplify the implementation.
- Do not add sample libraries, cloud requirements, analytics, accounts, plugin hosting, or DAW features without
  prior project discussion.
- Preserve keyboard accessibility, visible focus, reduced-motion behavior, and dark/light theme support.
- Keep user-facing claims and documentation aligned with behavior that is present and tested.

## Pull requests

A useful pull request includes:

- a concise explanation of the problem and the chosen change;
- the affected user workflow;
- tests and commands run;
- operating systems tested;
- screenshots for visible interface changes;
- audio or timing limitations that could not be automated;
- compatibility notes for mappings, scores, loops, recordings, or packaged resources.

Keep unrelated refactors out of the same pull request.

## License of contributions

By submitting a contribution, you confirm that you have the right to provide it and agree that it may be
distributed under the project's [MIT License](LICENSE.md).
