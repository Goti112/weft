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
public abstract class SocketTestBase extends PostgresTest {
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

}

