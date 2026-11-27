# Third-party components

## Vendored browser code

`web/vendor/qrcode.js` is **qrcode-generator 1.4.4** by Kazuhiko Arase, distributed under the MIT license. The original copyright header is retained; the complete license is in [web/vendor/LICENSE.qrcode-generator](web/vendor/LICENSE.qrcode-generator).

- Upstream: https://github.com/kazuhikoarase/qrcode-generator
- Exact package source: https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-1.4.4.tgz
- It generates the join QR code entirely in the browser. No external QR service is used.
- The offline preview bundles an unchanged copy of the same script and its copyright header.

## Build and test dependencies

PlatformIO installs the Espressif platform, Arduino-ESP32 framework, Espressif SDK and toolchains under their respective upstream licenses. They are not copied into the source archive. Review their license terms before redistributing compiled firmware.

Playwright is a development-only browser testing dependency. Its version and dependency integrity are recorded in `package-lock.json`; it is not loaded by the ESP32 UI.

- PlatformIO: https://github.com/platformio/platformio-core
- ESP32 platform: https://github.com/platformio/platform-espressif32
- Arduino-ESP32: https://github.com/espressif/arduino-esp32
- Playwright: https://github.com/microsoft/playwright

The original UI, SVG artwork, wiring diagram, game logic and documentation in this project are covered by [LICENSE](LICENSE).

Vendored JavaScript SHA-256: `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`.
