# Review the 0.2.0 source and hardware behavior

This guide covers the initial public source version and its remaining hardware acceptance checks. The offline preview uses simulated LEDs; publishing the repository does not update a physical board.

## Open the design

Open `preview/index.html` in a desktop browser. The file is self-contained and works without a server. For HTTP preview, run `python tools/preview.py` and open http://localhost:8765/preview/.

The purple preview banner distinguishes this from the real board interface. Virtual lights appear above the game. The Connect screen deliberately does not advertise a fake scannable board address. Scores in the preview reset on reload.

## Screenshot gallery

| Desktop | Phone |
| --- | --- |
| [Home](images/desktop-home.png) | [Home](images/mobile-home.png) |
| [Game](images/desktop-game.png) | [Game](images/mobile-game.png) |
| [Light studio](images/desktop-studio.png) | [Light studio](images/mobile-studio.png) |
| [Connect and QR](images/desktop-connect.png) | Responsive layout in the interactive preview |

Screenshots show the actual interface with a simulated device. On a phone, starting a game scrolls directly to the answer buttons.

## Suggested review

1. **Home:** choose Play, Studio or Connect from the new menu.
2. **Play:** choose a mode and speed, watch the virtual LEDs, then use the buttons or keys 1–4. Check full and half points.
3. **Studio:** tap a light directly. Try all on/off, brightness, Christmas, Breathe, Bounce and the timed test. End the session before starting a game.
4. **Connect:** review the Wi-Fi and iPhone guidance. The actual device version displays a local join QR once connected.
5. **Phone layout:** narrow the browser or use device emulation. Look at the bottom navigation and large targets.
6. **Documentation:** follow the wiring table and first-time setup as if you were a new builder.

## Validation and remaining acceptance

- Portable C++ game/controller tests cover exact and half points, maximum sequence length, timeouts, ownership-related state, effects, timed test boundaries and timestamp rollover.
- Browser integration covers two clients, game playback/input locking, duplicate taps, keyboard input, partial credit, reconnect, studio ownership, all effects, test synchronization/cancellation, QR, Wi-Fi setup and offline preview.
- Desktop and mobile screenshots use simulated device data and documentation-only addresses. They are not photographs or proof of a physical iPhone session.
- Firmware is compiled locally for the pinned classic ESP32 profile. Source publication is separate from firmware upload.
- Before using the redesign on hardware, still check actual Safari behavior, QR scanning with a phone, the physical color mapping and all effect outputs on the reference board. Network latency, hardware compatibility and router outage recovery need real-device validation.
- Check the latest [GitHub Actions run](https://github.com/DimitarDTsonev/blink-and-think/actions/workflows/checks.yml) for remote build status. Local test results and GitHub runs are separate validation steps.

## Repository and source packages

The project repository is [DimitarDTsonev/blink-and-think](https://github.com/DimitarDTsonev/blink-and-think). Run `python tools/package_source.py` to create a portable source archive with its MIT license, documentation and preview.

The repository contains only this project. Source archives exclude `.pio`, `node_modules`, device dumps, logs and local settings. Follow [SECURITY.md](../SECURITY.md) for vulnerability reporting.

No cloud hosting is needed to use the physical game. A public demo, if later desired, must use the simulator; a GitHub Pages website cannot directly replace the ESP32's same-origin local control page.
