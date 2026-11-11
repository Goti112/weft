package dev.weft.server.sync;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RateLimiterTest {
    static class MutableClock extends Clock {
        Instant now = Instant.EPOCH;
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }

    @Test void allowsBurstOf20ThenRejects() {
        var limiter = new RateLimiter(20, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        for (int i = 0; i < 20; i++) assertThat(limiter.tryAcquire()).isTrue();
        assertThat(limiter.tryAcquire()).isFalse();
    }

    @Test void refillsOverTime() {
        var clock = new MutableClock(); var limiter = new RateLimiter(20, clock);
        for (int i = 0; i < 20; i++) limiter.tryAcquire();
        clock.now = clock.now.plusMillis(50);
        assertThat(limiter.tryAcquire()).isTrue();
        assertThat(limiter.tryAcquire()).isFalse();
        clock.now = clock.now.plusSeconds(10);
        for (int i = 0; i < 20; i++) assertThat(limiter.tryAcquire()).isTrue();
        assertThat(limiter.tryAcquire()).isFalse();
    }
}
