package dev.weft.server.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.weft.server.PostgresTest;
import dev.weft.server.store.DocStore;
import dev.weft.server.store.IncomingOp;
import dev.weft.server.store.OpStore;
import jakarta.websocket.ContainerProvider;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import static org.assertj.core.api.Assertions.*;

public class SyncHandlerTest extends SocketTestBase {
    @Test void helloOnEmptyDocReturnsEmptyCatchup() throws Exception {
        try (var client = new Client()) {
            client.hello(docs.create(), 0);
            var result = client.receive();
            assertThat(result.path("t").asText()).isEqualTo("catchup");
            assertThat(result.path("ops").size()).isZero();
            assertThat(result.path("headSeq").asLong()).isZero();
            assertThat(result.path("done").asBoolean()).isTrue();
        }
    }

    @Test void opsAreAckedAndBroadcastToOthersOnly() throws Exception {
        var doc = docs.create();
        try (var a = new Client(); var b = new Client()) {
            a.hello(doc, 0); a.receive(); b.hello(doc, 0); b.receive();
            a.batch(operation(0));
            var ack = a.receive();
            assertThat(ack.path("t").asText()).isEqualTo("ack");
            assertThat(ack.path("opIds").get(0).path("counter").asInt()).isZero();
            var broadcast = b.receive();
            assertThat(broadcast.path("t").asText()).isEqualTo("ops");
            assertThat(broadcast.path("ops").get(0).path("seq").asLong()).isEqualTo(1);
            assertThat(a.messages.poll(200, TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test void reconnectCatchupReturnsMissing() throws Exception {
        var doc = docs.create();
        try (var a = new Client(); var b = new Client()) {
            a.hello(doc, 0); a.receive();
            a.batch(operation(0), operation(1), operation(2)); a.receive();
            b.hello(doc, 1);
            var page = b.receive();
            assertThat(page.path("ops").findValuesAsText("seq")).containsExactly("2", "3");
        }
    }

    @Test void catchupIsPaged() throws Exception {
        var doc = docs.create();
        ops.append(doc, IntStream.range(0, 12000).mapToObj(i -> new IncomingOp("a", i, operation(i))).toList());
        try (var client = new Client()) {
            client.hello(doc, 0);
            int total = 0; int pages = 0; boolean done;
            do {
                var page = client.receive();
                assertThat(page.path("ops").size()).isBetween(1, 5000);
                assertThat(json.writeValueAsBytes(page).length).isLessThanOrEqualTo(65536);
                total += page.path("ops").size(); pages++;
                done = page.path("done").asBoolean();
            } while (!done);
            assertThat(total).isEqualTo(12000);
            assertThat(pages).isGreaterThanOrEqualTo(3);
        }
    }

    @Test void duplicateBatchIsAckedNotBroadcast() throws Exception {
        var doc = docs.create();
        try (var a = new Client(); var b = new Client()) {
            a.hello(doc, 0); a.receive(); b.hello(doc, 0); b.receive();
            a.batch(operation(0)); a.receive(); b.receive();
            a.batch(operation(0));
            assertThat(a.receive().path("opIds").size()).isEqualTo(1);
            assertThat(b.messages.poll(200, TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test void opsBeforeHelloGivesNoHello() throws Exception {
        try (var c = new Client()) {
            c.batch(operation(0));
            assertThat(c.receive().path("code").asText()).isEqualTo("NO_HELLO");
        }
    }

    @Test void malformedJsonGivesBadMessage() throws Exception {
        try (var c = new Client()) {
            c.send("{");
            assertThat(c.receive().path("code").asText()).isEqualTo("BAD_MESSAGE");
            c.hello(docs.create(), 0);
            assertThat(c.receive().path("t").asText()).isEqualTo("catchup");
        }
    }

    @Test void unknownDocGivesDocNotFound() throws Exception {
        try (var c = new Client()) {
            c.hello("missing", 0);
            assertThat(c.receive().path("code").asText()).isEqualTo("DOC_NOT_FOUND");
            assertThat(c.closes.poll(5, TimeUnit.SECONDS)).isNotNull();
        }
    }
}

