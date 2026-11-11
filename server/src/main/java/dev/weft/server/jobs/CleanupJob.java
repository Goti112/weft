package dev.weft.server.jobs;

import dev.weft.server.store.DocStore;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CleanupJob {
    private final DocStore docs;
    public CleanupJob(DocStore docs) { this.docs = docs; }
    @Scheduled(cron = "0 0 * * * *")
    public void run() { docs.deleteInactiveBefore(Instant.now().minus(7, ChronoUnit.DAYS)); }
}
