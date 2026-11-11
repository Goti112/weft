package dev.weft.server.sync;

import dev.weft.server.store.IncomingOp;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LimitsTest extends SocketTestBase {
    @Test void batchOver500GivesLimitExceeded() throws Exception {
        try (var c = new Client()) {
            c.hello(docs.create(), 0); c.receive();
            c.batch(IntStream.range(0, 501).mapToObj(this::operation).toArray(String[]::new));
            assertThat(c.receive().path("code").asText()).isEqualTo("LIMIT_EXCEEDED");
            assertThat(c.session.isOpen()).isTrue();
        }
    }

    @Test void messageOver64KbIsRejected() throws Exception {
        try (var c = new Client()) {
            c.hello(docs.create(), 0); c.receive();
            c.batch(operation(0).replace("\"x\"", "\"" + "x".repeat(70_000) + "\""));
            var message = c.messages.poll(2, TimeUnit.SECONDS);
            if (message != null) assertThat(message.path("code").asText()).isEqualTo("LIMIT_EXCEEDED");
            else assertThat(c.closes.poll(5, TimeUnit.SECONDS).getCode()).isEqualTo(1009);
        }
    }

    @Test void over20MessagesPerSecondGivesLimitExceeded() throws Exception {
        try (var c = new Client()) {
            c.hello(docs.create(), 0); c.receive();
            for (int i = 0; i < 30; i++) c.batch();
            boolean limited = false;
            for (int i = 0; i < 30; i++) limited |= c.receive().path("code").asText().equals("LIMIT_EXCEEDED");
            assertThat(limited).isTrue();
        }
    }

    @Test void docOver5MbGivesLimitExceeded() throws Exception {
        var doc = docs.create();
        ops.append(doc, List.of(new IncomingOp("seed", 0, "{\"text\":\"" + "x".repeat(5 * 1024 * 1024 - 200) + "\"}")));
        try (var c = new Client()) {
            c.hello(doc, Long.MAX_VALUE); c.receive();
            c.batch(operation(0).replace("\"x\"", "\"" + "x".repeat(1000) + "\""));
            assertThat(c.receive().path("code").asText()).isEqualTo("LIMIT_EXCEEDED");
        }
    }

    @Test void catchupPagesStayUnder64Kb() throws Exception {
        var doc = docs.create();
        ops.append(doc, IntStream.range(0, 100).mapToObj(i -> new IncomingOp("a", i,
                operation(i).replace("\"x\"", "\"" + "x".repeat(1000) + "\""))).toList());
        try (var c = new Client()) {
            c.hello(doc, 0);
            int total = 0; boolean done;
            do {
                var page = c.receive();
                assertThat(json.writeValueAsBytes(page).length).isLessThanOrEqualTo(65536);
                total += page.path("ops").size(); done = page.path("done").asBoolean();
            } while (!done);
            assertThat(total).isEqualTo(100);
        }
    }
}
