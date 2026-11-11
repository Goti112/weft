package dev.weft.server.jobs;

import dev.weft.server.PostgresTest;
import dev.weft.server.store.DocStore;
import java.time.Instant;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import static org.assertj.core.api.Assertions.*;

class CleanupJobTest extends PostgresTest {
    @Autowired CleanupJob job;
    @Autowired DocStore docs;
    @Autowired JdbcClient jdbc;

    @Test void deletesOnlyInactiveDocs() {
        var old = docs.create(); var recent = docs.create();
        jdbc.sql("update docs set last_active = :at where id = :id")
                .param("id", old).param("at", Timestamp.from(Instant.now().minusSeconds(8 * 86400))).update();
        job.run();
        assertThat(docs.exists(old)).isFalse();
        assertThat(docs.exists(recent)).isTrue();
    }
}
