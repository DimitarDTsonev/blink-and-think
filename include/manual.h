#pragma once
#include <array>
#include <cstdint>

// One controller leases the outputs. Losing its heartbeat always turns them off.
class ManualControl {
public:
    static constexpr uint32_t Lease = 15000;
    static constexpr uint32_t TestLead = 1200, TestOn = 1500, TestStep = 1800, TestDuration = 4 * TestStep;
    bool start(uint32_t now) {
        if (active_) return false;
        active_ = true; testing_ = false; mask_ = effect_ = 0; since_ = heartbeat_ = now;
        return true;
    }
    bool set(uint32_t now, unsigned mask, unsigned brightness, unsigned effect, uint32_t interval) {
        if (!active_ || mask > 15 || brightness > 100 || effect > 5 || interval < 100 || interval > 2000) return false;
        testing_ = false;
        mask_ = mask; brightness_ = brightness; effect_ = effect; interval_ = interval;
        since_ = heartbeat_ = now;
        return true;
    }
    bool startTest(uint32_t now) {
        if (!active_) return false;
        testing_ = true; mask_ = effect_ = 0; brightness_ = 50;
        testStart_ = now + TestLead; heartbeat_ = now;
        return true;
    }
    void tick(uint32_t now) {
        if (active_ && uint32_t(now - heartbeat_) >= Lease) stop();
        if (testing_ && int32_t(now - testStart_) >= int32_t(TestDuration)) testing_ = false;
    }
    void heartbeat(uint32_t now) { if (active_) heartbeat_ = now; }
    void stop() { active_ = testing_ = false; mask_ = effect_ = 0; }
    bool active() const { return active_; }
    unsigned mask() const { return mask_; }
    unsigned brightness() const { return brightness_; }
    unsigned effect() const { return effect_; }
    uint32_t interval() const { return interval_; }
    bool testing() const { return testing_; }
    uint32_t testStart() const { return testStart_; }
    int testLed(uint32_t now) const {
        const int32_t elapsed = int32_t(now - testStart_);
        if (!active_ || !testing_ || elapsed < 0 || elapsed >= int32_t(TestDuration) ||
            uint32_t(elapsed) % TestStep >= TestOn) return -1;
        static constexpr unsigned order[] = {0, 1, 3, 2};
        return order[uint32_t(elapsed) / TestStep];
    }
    std::array<unsigned, 4> outputs(uint32_t now) const {
        std::array<unsigned, 4> result{};
        if (!active_) return result;
        if (testing_) {
            const int led = testLed(now);
            if (led >= 0) result[led] = brightness_ * 255 / 100;
            return result;
        }
        unsigned bits = mask_;
        const uint32_t step = uint32_t(now - since_) / interval_;
        // Physical order: red, green 1, yellow, green 2.
        static constexpr unsigned order[] = {0, 1, 3, 2};
        if (effect_ == 1) bits = 1u << order[step % 4];
        if (effect_ == 2) bits = step % 2 ? 0 : 15;
        if (effect_ == 3) {
            // Christmas: warm colors, both greens, then a short sparkle.
            static constexpr unsigned christmas[] = {9, 6, 9, 6, 15, 0, 15, 0};
            bits = christmas[step % 8];
        }
        unsigned duty = brightness_ * 255 / 100;
        if (effect_ == 4) {
            bits = 15;
            const uint32_t period = interval_ * 4;
            const uint32_t position = uint32_t(now - since_) % period;
            const uint32_t ramp = position <= period / 2 ? position : period - position;
            duty = duty * ramp / (period / 2);
        }
        if (effect_ == 5) {
            static constexpr unsigned bounce[] = {0, 1, 3, 2, 3, 1};
            bits = 1u << bounce[step % 6];
        }
        for (unsigned i = 0; i < 4; ++i) result[i] = bits & (1u << i) ? duty : 0;
        return result;
    }
private:
    bool active_ = false;
    bool testing_ = false;
    unsigned mask_ = 0, brightness_ = 35, effect_ = 0;
    uint32_t interval_ = 500, since_ = 0, heartbeat_ = 0;
    uint32_t testStart_ = 0;
};
