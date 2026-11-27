# Security and privacy

## Intended environment

This project is designed for a trusted local Wi-Fi network. It serves **HTTP**, not HTTPS, and has no user authentication. `X-Player-Id` is a turn-ownership mechanism, not an identity system. Do not expose the ESP32 through router port forwarding or use it to control safety-critical equipment.

The browser uses a per-tab session ID, a display name and locally saved UI preferences. No analytics, cloud account, external font service or remote QR service is used. Game data is exchanged only with the board's own origin. The standalone preview uses a local simulator and never connects to hardware.

Wi-Fi credentials and the setup AP password are stored in the ESP32's NVS. Firmware does not configure NVS/flash encryption. A device dump may reveal credentials; do not upload dumps, serial logs with setup passwords or private network screenshots to GitHub. The repository contains no real credentials, device serial numbers or production network addresses.

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/DimitarDTsonev/blink-and-think/security/advisories/new) when available, or contact the [maintainer](https://github.com/DimitarDTsonev) privately through their GitHub profile. Do not open a public issue containing credentials, working exploit details or another person's network data.

Include the affected version, reproduction steps and impact without private data. There is no promised response time or formal security audit. Maintainers should keep this file up to date if the reporting channel changes.
