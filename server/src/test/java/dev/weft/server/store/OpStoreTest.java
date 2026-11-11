package dev.weft.server.store;

import dev.weft.server.PostgresTest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.*;

class OpStoreTest extends PostgresTest {
    @Autowired DocStore docs;
    @Autowired OpStore ops;
    @Autowired JdbcClient jdbc;
    String doc;

    @BeforeEach void createDoc() { doc = docs.create(); }

    private IncomingOp op(String replica, long counter) {
        return new IncomingOp(replica, counter,
                "{\"type\":\"insert\",\"opId\":{\"replica\":\"" + replica
                + "\",\"counter\":" + counter + "},\"parent\":null,\"side\":\"R\",\"text\":\"x\"}");
    }

    private List<IncomingOp> threeOps() {
        return List.of(op("a", 0), op("a", 1), op("a", 2));
    }

    @Test void appendAssignsIncreasingSeqs() {
        assertThat(ops.append(doc, threeOps())).extracting(StoredOp::seq).containsExactly(1L, 2L, 3L);
    }

    @Test void duplicateOpsAreIgnored() {
        ops.append(doc, List.of(op("a", 0)));
        assertThat(ops.append(doc, List.of(op("a", 0)))).isEmpty();
        assertThat(ops.after(doc, 0, 100)).hasSize(1);
    }

    @Test void afterReturnsOnlyNewer() {
        ops.append(doc, threeOps());
        assertThat(ops.after(doc, 2, 100)).extracting(StoredOp::seq).containsExactly(3L);
    }

    @Test void afterRespectsLimit() {
        ops.append(doc, threeOps());
        assertThat(ops.after(doc, 0, 2)).extracting(StoredOp::seq).containsExactly(1L, 2L);
    }

    @Test void unknownDocThrows() {
        assertThatThrownBy(() -> ops.append("missing", threeOps())).isInstanceOf(DocNotFoundException.class);
    }

    @Test void sizeLimitEnforced() {
        String largePayload = "{\"text\":\"" + "x".repeat(5 * 1024 * 1024) + "\"}";
        assertThatThrownBy(() -> ops.append(doc, List.of(new IncomingOp("a", 0, largePayload))))
                .isInstanceOf(DocTooLargeException.class);
        assertThat(ops.after(doc, 0, 100)).isEmpty();
        assertThat(ops.headSeq(doc)).isZero();
    }

    @Test void concurrentAppendsGetUniqueSeqs() throws Exception {
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<Callable<Void>> tasks = new ArrayList<>();
            for (int thread = 0; thread < 8; thread++) {
                String replica = "r" + thread;
                tasks.add(() -> {
                    for (int i = 0; i < 50; i++) ops.append(doc, List.of(op(replica, i)));
                    return null;
                });
            }
            for (var future : executor.invokeAll(tasks)) future.get();
        }
        var stored = ops.after(doc, 0, 1000);
        assertThat(stored).hasSize(400);
        assertThat(stored.stream().map(StoredOp::seq).distinct().count()).isEqualTo(400);
    }

    @Test void deleteInactiveBefore() {
        ops.append(doc, threeOps());
        jdbc.sql("update docs set last_active = :at where id = :doc")
                .param("at", java.sql.Timestamp.from(Instant.now().minusSeconds(8 * 86400)))
                .param("doc", doc).update();
        docs.deleteInactiveBefore(Instant.now().minusSeconds(7 * 86400));
        assertThat(docs.exists(doc)).isFalse();
        assertThat(ops.after(doc, 0, 100)).isEmpty();
    }
}
