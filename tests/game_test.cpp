#include "game.h"
#include "manual.h"
#include <cassert>
#include <iostream>
#include <vector>

uint32_t randomValue = 0;
uint32_t predictable() { return randomValue++; }
uint32_t repeated() { return 2; }
using Phase = MemoryGame::Phase;
using Result = MemoryGame::Result;

// Observe actual LED output, just as a player does; no private sequence access.
std::vector<unsigned> watch(MemoryGame &game, uint32_t &now) {
    std::vector<unsigned> colors;
    int previous = -1;
    for (unsigned steps = 0; game.phase() != Phase::Input; ++steps) {
        assert(steps < 100000 && game.busy());
        game.heartbeat(now);
        game.tick(now);
        const int led = game.led();
        if (led >= 0 && previous < 0) colors.push_back(led);
        previous = led;
        now += 5;
    }
    return colors;
}

int main() {
    for (const auto mode : {MemoryGame::Mode::Classic, MemoryGame::Mode::Reverse, MemoryGame::Mode::Shuffle}) {
        MemoryGame game(predictable); uint32_t now = 0; randomValue = 0;
        assert(game.start(now, 250, mode));
        const auto colors = watch(game, now);
        unsigned points = 0;
        for (unsigned i = 0; i < colors.size(); ++i) {
            const auto expected = colors[mode == MemoryGame::Mode::Reverse ? colors.size()-1-i : i];
            const bool green = expected == 1 || expected == 2;
            const unsigned answer = green ? 3-expected : expected;
            assert(game.press(now++, answer, colors.size(), i));
            points += green ? 1 : 2;
            assert(game.lastAwardHalf() == (green ? 1u : 2u) && game.pointsHalf() == points);
            assert(!game.press(now, answer, colors.size(), i));
            assert(game.pointsHalf() == points); // Duplicate cannot award twice.
        }
        assert(game.score() == 1 && game.phase() == Phase::RoundWon && points == 4);
        game.cancel(now); game.clear(); assert(game.pointsHalf() == 0);
    }
    {
        ManualControl manual;
        assert(!manual.startTest(0)); assert(manual.start(0)); assert(manual.startTest(0));
        assert(manual.testStart() == 1200 && manual.testLed(1199) == -1);
        const unsigned order[] = {0,1,3,2};
        for (unsigned i = 0; i < 4; ++i) {
            const auto start = manual.testStart() + i * ManualControl::TestStep;
            assert(manual.testLed(start) == int(order[i]));
            assert(manual.testLed(start+1499) == int(order[i]));
            assert(manual.outputs(start)[order[i]] == 127);
            assert(manual.testLed(start+1500) == -1 && manual.testLed(start+1799) == -1);
        }
        manual.tick(8400); assert(!manual.testing());
        assert((manual.outputs(8400) == std::array<unsigned,4>{0,0,0,0}));
        assert(manual.startTest(9000)); assert(manual.set(9100,0,50,0,500));
        assert(!manual.testing() && manual.testLed(10500) == -1);
        assert(manual.startTest(10000)); manual.stop(); assert(!manual.testing());
        assert(manual.start(UINT32_MAX-500)); assert(manual.startTest(UINT32_MAX-500));
        assert(manual.testLed(698) == -1 && manual.testLed(699) == 0);
        manual.tick(8000); assert(!manual.testing());
        manual.stop(); assert(manual.start(0));
        assert(manual.set(0,0,100,3,500));
        assert((manual.outputs(0) == std::array<unsigned,4>{255,0,0,255}));
        assert((manual.outputs(500) == std::array<unsigned,4>{0,255,255,0}));
        assert(manual.set(0,0,100,4,500));
        assert(manual.outputs(0)[0] == 0 && manual.outputs(1000)[0] == 255 && manual.outputs(2000)[0] == 0);
        assert(manual.set(0,0,100,5,500));
        assert(manual.outputs(1500)[2] == 255 && manual.outputs(2000)[3] == 255 && manual.outputs(2500)[1] == 255);
        assert(manual.set(0,15,100,0,500));
        assert((manual.outputs(0) == std::array<unsigned,4>{255,255,255,255}));
    }
    {
        MemoryGame game(predictable); uint32_t now = 0;
        assert(!game.start(now, 500, MemoryGame::Mode(3)));
        assert(game.start(now, 500, MemoryGame::Mode::Reverse));
        const auto colors = watch(game, now);
        for (unsigned i = 0; i < colors.size(); ++i)
            assert(game.press(now++, colors[colors.size()-1-i], colors.size(), i));
        assert(game.phase() == Phase::RoundWon && game.score() == 1);
        game.cancel(now); game.clear(); assert(game.phase() == Phase::Idle && game.score() == 0);
        assert(game.start(now, 500, MemoryGame::Mode::Shuffle));
        const auto first = watch(game, now);
        for (unsigned i = 0; i < first.size(); ++i) assert(game.press(now++, first[i], first.size(), i));
        const auto nextRandom = randomValue;
        const auto second = watch(game, now);
        assert(second.size() == 4 && randomValue == nextRandom + 5);
        for (unsigned i = 0; i < second.size(); ++i) assert(second[i] == (nextRandom + 1 + i) % 4);
        for (unsigned i = 0; i < second.size(); ++i) assert(game.press(now++, second[i], second.size(), i));
        assert(game.score() == 2);
    }
    {
        ManualControl manual;
        assert(!manual.set(0, 15, 100, 0, 500));
        assert(manual.start(0) && !manual.start(1));
        assert((manual.outputs(0) == std::array<unsigned,4>{0,0,0,0}));
        assert(!manual.set(0, 16, 100, 0, 500));
        assert(!manual.set(0, 15, 101, 0, 500));
        assert(!manual.set(0, 15, 100, 6, 500));
        assert(!manual.set(0, 15, 100, 0, 0));
        assert(manual.set(0, 5, 50, 0, 500));
        assert((manual.outputs(0) == std::array<unsigned,4>{127,0,127,0}));
        assert(manual.set(0, 0, 100, 1, 500));
        assert(manual.outputs(0)[0] == 255 && manual.outputs(500)[1] == 255);
        assert(manual.outputs(1000)[3] == 255 && manual.outputs(1500)[2] == 255);
        assert(manual.set(0, 0, 100, 2, 500));
        assert((manual.outputs(0) == std::array<unsigned,4>{255,255,255,255}));
        assert((manual.outputs(500) == std::array<unsigned,4>{0,0,0,0}));
        manual.heartbeat(14000); manual.tick(15000); assert(manual.active());
        manual.tick(29000); assert(!manual.active());
        assert((manual.outputs(29000) == std::array<unsigned,4>{0,0,0,0}));
        assert(manual.start(UINT32_MAX-1000));
        manual.tick(100); assert(manual.active());
        manual.tick(15000); assert(!manual.active());
        assert(manual.start(16000)); manual.stop(); assert(!manual.active());
    }
    for (uint32_t speed : {2000u, 1000u, 500u, 250u}) {
        uint32_t now = 100;
        MemoryGame game(predictable);
        assert(game.start(now, speed));
        assert(!game.start(now, speed)); // A second player cannot replace a game.
        assert(!game.press(now, 0, 3, 0)); // No input during playback/countdown.
        std::vector<unsigned> previous;
        for (unsigned length = 3; length <= MemoryGame::MaxLength; ++length) {
            const auto colors = watch(game, now);
            assert(colors.size() == length && game.length() == length);
            for (unsigned i = 0; i < previous.size(); ++i) assert(colors[i] == previous[i]);
            assert(!game.press(now, 4, length, 0));
            assert(!game.press(now, colors[0], length + 1, 0));
            assert(!game.press(now, colors[0], length, 1));
            for (unsigned i = 0; i < length; ++i) {
                assert(game.press(now++, colors[i], length, i));
                assert(!game.press(now, colors[i], length, i)); // Duplicate request.
            }
            assert(game.score() == length - 2);
            assert(game.led() == -1);
            previous = colors;
        }
        assert(game.phase() == Phase::Over && game.result() == Result::Completed);
        assert(game.score() == 30 && !game.busy());
        assert(game.pointsHalf() == 1050); // 3+4+...+32 exact answers, one point each.
        assert(game.start(now, speed));
        assert(game.score() == 0 && game.length() == 3);
    }
    {
        MemoryGame game(repeated); uint32_t now = 0;
        assert(!game.start(now, 0)); assert(!game.start(now, 499));
        game.start(now, 1000);
        auto colors = watch(game, now);
        assert((colors == std::vector<unsigned>{2,2,2})); // Dark gaps separate repeats.
        assert(game.press(now, 0, 3, 0));
        assert(game.result() == Result::Mistake && !game.busy() && game.led() == -1);
    }
    {
        MemoryGame game(repeated); uint32_t now = 0;
        game.start(now, 250); watch(game, now);
        now += MemoryGame::AnswerTimeout;
        game.heartbeat(now); game.tick(now);
        assert(game.result() == Result::Timeout && game.remaining(now) == 0);
    }
    {
        MemoryGame game(repeated); game.start(0, 1000);
        game.tick(MemoryGame::PresenceTimeout);
        assert(game.result() == Result::Abandoned && game.led() == -1);
        assert(game.start(20000, 1000)); game.cancel(20001);
        assert(game.result() == Result::Cancelled && !game.busy());
    }
    {
        // millis() wraps after ~49 days; no false timeouts at rollover.
        MemoryGame game(predictable); uint32_t now = UINT32_MAX - 1000;
        game.start(now, 500); auto colors = watch(game, now);
        assert(colors.size() == 3 && game.phase() == Phase::Input);
    }
    {
        // A delayed loop must not skip any LED in the sequence.
        MemoryGame game(repeated); game.start(0, 250);
        game.heartbeat(5000); game.tick(5000); assert(game.led() == 2);
        game.heartbeat(9000); game.tick(9000); assert(game.led() == -1);
        game.tick(9063); assert(game.led() == 2);
    }
    std::cout << "PASS: all game modes, exact/half points, duplicates, max score, 1500ms test timing/gaps/rollover/cancel, Christmas/breathing/bounce, all-on, validation and fail-off lease\n";
}
