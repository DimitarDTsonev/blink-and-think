# Contributing

Blink & Think is a small, local-first hardware project. Changes should stay approachable for someone building their first breadboard circuit.

1. Describe the problem or player experience in an issue before a large change.
2. Keep public documentation, UI strings, comments and examples in English.
3. Follow [the development guide](docs/development.md). Use four physical LEDs as the default hardware profile; explain new components explicitly.
4. Preserve server-side session ownership, stale-answer checks and automatic output shutdown. The real game API must not reveal its sequence.
5. Update C++ tests for game/controller changes. Check browser interactions and desktop/mobile layouts for UI changes.
6. Update the demo when behavior changes and regenerate `preview/index.html` with `python tools/build_preview.py`.
7. Run the relevant checks, document what was not tested and include sanitized screenshots for visual changes.

Keep passwords, local SSIDs, USB serial numbers, board MAC addresses, NVS dumps, generated firmware and machine-specific paths out of source control. The source package deliberately excludes local build output.

Changes to GPIO mapping or scoring must update code, UI, tests, simulator and hardware documentation together. Use the PR template to summarize the resulting behavior and verification. Contributions are provided under the project's MIT license unless separately agreed before inclusion.
