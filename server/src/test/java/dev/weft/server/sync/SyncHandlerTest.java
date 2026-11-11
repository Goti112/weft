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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class SyncHandlerTest extends PostgresTest {
    @LocalServerPort protected int port;
    @Autowired protected DocStore docs;
    @Autowired protected OpStore ops;
    @Autowired protected ObjectMapper json;

    protected String operation(int counter) {
        return "{\"type\":\"insert\",\"opId\":{\"replica\":\"a\",\"counter\":" + counter
                + "},\"parent\":null,\"side\":\"R\",\"text\":\"x\"}";
    }

    protected class Client implements AutoCloseable {
        final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        final BlockingQueue<CloseStatus> closes = new LinkedBlockingQueue<>();
        final WebSocketSession session;

        Client() throws Exception {
            var container = ContainerProvider.getWebSocketContainer();
            container.setDefaultMaxTextMessageBufferSize(10 * 1024 * 1024);
            session = new StandardWebSocketClient(container).execute(new TextWebSocketHandler() {
                @Override protected void handleTextMessage(WebSocketSession s, TextMessage m) throws Exception {
                    messages.add(json.readTree(m.getPayload()));
                }
                @Override public void afterConnectionClosed(WebSocketSession s, CloseStatus status) {
                    closes.add(status);
                }
            }, "ws://localhost:" + port + "/ws").get(10, TimeUnit.SECONDS);
        }
        void send(String data) throws Exception { session.sendMessage(new TextMessage(data)); }
        JsonNode receive() throws Exception {
            JsonNode result = messages.poll(10, TimeUnit.SECONDS);
            assertThat(result).as("server message").isNotNull();
            return result;
        }
        void hello(String doc, long seq) throws Exception {
            send("{\"t\":\"hello\",\"doc\":\"" + doc + "\",\"replica\":\"test\",\"lastSeq\":" + seq + "}");
        }
        void batch(String... payloads) throws Exception {
            send("{\"t\":\"ops\",\"ops\":[" + String.join(",", payloads) + "]}");
        }
        @Override public void close() throws Exception { session.close(); }
    }

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
            var p1 = client.receive(); var p2 = client.receive(); var p3 = client.receive();
            assertThat(List.of(p1.path("ops").size(), p2.path("ops").size(), p3.path("ops").size()))
                    .containsExactly(5000, 5000, 2000);
            assertThat(p1.path("done").asBoolean()).isFalse();
            assertThat(p2.path("done").asBoolean()).isFalse();
            assertThat(p3.path("done").asBoolean()).isTrue();
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
