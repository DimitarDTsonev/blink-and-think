#pragma once

// Logical order: red, green 1, green 2, yellow. Each LED needs a 220–330 ohm resistor.
// LED cathodes (short legs) go to GND.
// Reference build: white wire D25, blue D26, purple D33, gray D27.
constexpr unsigned LED_PINS[] = {25, 26, 33, 27};
// Optional passive piezo buzzer. Enable only after checking its model/wiring.
constexpr int BUZZER_PIN = -1;
