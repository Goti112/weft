package dev.weft.server.store;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class OpStore {
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private final JdbcClient jdbc;

    public OpStore(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    public List<StoredOp> append(String docId, List<IncomingOp> ops) {
        var row = jdbc.sql("select next_seq, bytes from docs where id = :doc for update")
                .param("doc", docId)
                .query((rs, n) -> new long[] { rs.getLong("next_seq"), rs.getLong("bytes") })
                .optional().orElseThrow(() -> new DocNotFoundException(docId));
        long seq = row[0];
        long bytes = row[1];
        List<StoredOp> stored = new ArrayList<>();
        for (IncomingOp op : ops) {
            var inserted = jdbc.sql("""
                    insert into ops(doc_id, seq, replica_id, counter, payload)
                    values (:doc, :seq, :replica, :counter, cast(:payload as jsonb))
                    on conflict (doc_id, replica_id, counter) do nothing
                    returning seq, payload::text
                    """)
                    .param("doc", docId).param("seq", seq)
                    .param("replica", op.replicaId()).param("counter", op.counter())
                    .param("payload", op.payloadJson())
                    .query((rs, n) -> new StoredOp(rs.getLong(1), rs.getString(2))).optional();
            // Only stored ops consume a seq, so a document's seqs are contiguous (1..head).
            // Clients rely on this to resume catch-up from their delivery watermark.
            if (inserted.isPresent()) {
                seq++;
                bytes += op.payloadJson().getBytes(StandardCharsets.UTF_8).length;
                if (bytes > MAX_BYTES) throw new DocTooLargeException();
                stored.add(inserted.get());
            }
        }
        jdbc.sql("update docs set next_seq = :seq, bytes = :bytes, last_active = now() where id = :doc")
                .param("seq", seq).param("bytes", bytes).param("doc", docId).update();
        return stored;
    }

    public List<StoredOp> after(String docId, long afterSeq, int limit) {
        return jdbc.sql("select seq, payload::text from ops where doc_id = :doc and seq > :seq order by seq limit :limit")
                .param("doc", docId).param("seq", afterSeq).param("limit", limit)
                .query((rs, n) -> new StoredOp(rs.getLong(1), rs.getString(2))).list();
    }

    public long headSeq(String docId) {
        return jdbc.sql("select next_seq - 1 from docs where id = :doc")
                .param("doc", docId).query(Long.class).optional()
                .orElseThrow(() -> new DocNotFoundException(docId));
    }
}
