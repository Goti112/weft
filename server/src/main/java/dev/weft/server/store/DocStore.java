package dev.weft.server.store;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class DocStore {
    private static final char[] ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray();
    private final SecureRandom random = new SecureRandom();
    private final JdbcClient jdbc;

    public DocStore(JdbcClient jdbc) { this.jdbc = jdbc; }

    public String create() {
        for (;;) {
            char[] chars = new char[10];
            for (int i = 0; i < chars.length; i++) chars[i] = ALPHABET[random.nextInt(ALPHABET.length)];
            String id = new String(chars);
            if (jdbc.sql("insert into docs(id) values (:id) on conflict do nothing")
                    .param("id", id).update() == 1) return id;
        }
    }

    public boolean exists(String docId) {
        return jdbc.sql("select exists(select 1 from docs where id = :id)")
                .param("id", docId).query(Boolean.class).single();
    }

    public int deleteInactiveBefore(Instant cutoff) {
        return jdbc.sql("delete from docs where last_active < :cutoff")
                .param("cutoff", Timestamp.from(cutoff)).update();
    }
}
