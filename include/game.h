#pragma once
#include <array>
#include <cstdint>

// Game logic is independent of Wi-Fi/GPIO and can be tested on a computer.
class MemoryGame {
public:
    enum class Phase { Idle, Countdown, Showing, Input, RoundWon, Over };
    enum class Result { None, Mistake, Timeout, Abandoned, Completed, Cancelled };
    enum class Mode { Classic, Reverse, Shuffle };
    static constexpr unsigned MaxLength = 32;
    static constexpr uint32_t AnswerTimeout = 30000, PresenceTimeout = 15000;
    using Random = uint32_t (*)();
    explicit MemoryGame(Random random) : random_(random) {}

    bool start(uint32_t now, uint32_t interval, Mode mode = Mode::Classic) {
        if (busy() || !validInterval(interval) || unsigned(mode) > 2) return false;
        mode_ = mode;
        interval_ = interval;
        length_ = 3;
        score_ = answered_ = 0;
        pointsHalf_ = lastAwardHalf_ = 0;
        for (unsigned i = 0; i < length_; ++i) sequence_[i] = random_() % 4;
        result_ = Result::None;
        heartbeat_ = now;
        enter(Phase::Countdown, now);
        return true;
    }
    void tick(uint32_t now) {
        if (!busy()) return;
        if (uint32_t(now - heartbeat_) >= PresenceTimeout) {
            finish(Result::Abandoned, now); return;
        }
        switch (phase_) {
        case Phase::Countdown:
            if (uint32_t(now - since_) >= 1500) {
                shown_ = 0; illuminated_ = true; enter(Phase::Showing, now);
            }
            break;
        case Phase::Showing:
            // Never skip a flash to catch up after a slow network request.
            if (illuminated_ && uint32_t(now - since_) >= interval_ * 3 / 4) {
                illuminated_ = false; since_ = now;
            } else if (!illuminated_ && uint32_t(now - since_) >= interval_ - interval_ * 3 / 4) {
                if (++shown_ == length_) { answered_ = 0; enter(Phase::Input, now); }
                else { illuminated_ = true; since_ = now; }
            }
            break;
        case Phase::Input:
            if (uint32_t(now - since_) >= AnswerTimeout) finish(Result::Timeout, now);
            break;
        case Phase::RoundWon:
            if (uint32_t(now - since_) >= 1400) {
                sequence_[length_++] = random_() % 4; enter(Phase::Countdown, now);
                if (mode_ == Mode::Shuffle)
                    for (unsigned i = 0; i < length_; ++i) sequence_[i] = random_() % 4;
            }
            break;
        default: break;
        }
    }
    // Reject duplicate, late and out-of-order network responses.
    bool press(uint32_t now, unsigned color, unsigned expectedLength, unsigned index) {
        if (phase_ != Phase::Input || color > 3 || expectedLength != length_ || index != answered_)
            return false;
        const unsigned position = mode_ == Mode::Reverse ? length_ - 1 - answered_ : answered_;
        const unsigned expected = sequence_[position];
        lastAwardHalf_ = color == expected ? 2 :
            ((color == 1 || color == 2) && (expected == 1 || expected == 2) ? 1 : 0);
        if (!lastAwardHalf_) { finish(Result::Mistake, now); return true; }
        pointsHalf_ += lastAwardHalf_;
        ++answered_;
        since_ = now;
        if (answered_ == length_) {
            ++score_;
            if (length_ == MaxLength) finish(Result::Completed, now);
            else enter(Phase::RoundWon, now);
        }
        return true;
    }
    void heartbeat(uint32_t now) { heartbeat_ = now; }
    void cancel(uint32_t now) { if (busy()) finish(Result::Cancelled, now); }
    void clear() { if (!busy()) { phase_ = Phase::Idle; result_ = Result::None; length_ = answered_ = score_ = pointsHalf_ = lastAwardHalf_ = 0; } }
    bool busy() const { return phase_ != Phase::Idle && phase_ != Phase::Over; }
    Phase phase() const { return phase_; }
    Result result() const { return result_; }
    unsigned length() const { return length_; }
    unsigned answered() const { return answered_; }
    unsigned score() const { return score_; }
    unsigned pointsHalf() const { return pointsHalf_; }
    unsigned lastAwardHalf() const { return lastAwardHalf_; }
    Mode mode() const { return mode_; }
    uint32_t interval() const { return interval_; }
    int led() const { return phase_ == Phase::Showing && illuminated_ ? sequence_[shown_] : -1; }
    uint32_t remaining(uint32_t now) const {
        if (phase_ != Phase::Input) return 0;
        const uint32_t elapsed = now - since_;
        return elapsed < AnswerTimeout ? AnswerTimeout - elapsed : 0;
    }
    static bool validInterval(uint32_t v) { return v == 2000 || v == 1000 || v == 500 || v == 250; }
private:
    void enter(Phase phase, uint32_t now) { phase_ = phase; since_ = now; }
    void finish(Result reason, uint32_t now) {
        result_ = reason; illuminated_ = false; enter(Phase::Over, now);
    }
    Random random_;
    std::array<uint8_t, MaxLength> sequence_{};
    Phase phase_ = Phase::Idle;
    Result result_ = Result::None;
    Mode mode_ = Mode::Classic;
    unsigned length_ = 0, shown_ = 0, answered_ = 0, score_ = 0;
    unsigned pointsHalf_ = 0, lastAwardHalf_ = 0;
    uint32_t interval_ = 1000, since_ = 0, heartbeat_ = 0;
    bool illuminated_ = false;
};
