package dev.weft.server.sync;

import java.time.Clock;

public class RateLimiter {
    private final int capacity;
    private final Clock clock;
    private double tokens;
    private long lastMillis;

    public RateLimiter(int perSecond, Clock clock) {
        if (perSecond <= 0) throw new IllegalArgumentException("Rate must be positive");
        this.capacity = perSecond; this.tokens = perSecond; this.clock = clock;
        this.lastMillis = clock.millis();
    }

    public synchronized boolean tryAcquire() {
        long now = clock.millis();
        tokens = Math.min(capacity, tokens + Math.max(0, now - lastMillis) * capacity / 1000.0);
        lastMillis = Math.max(lastMillis, now);
        if (tokens < 1) return false;
        tokens--;
        return true;
    }
}
