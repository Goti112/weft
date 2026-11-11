package dev.weft.server.sync;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.weft.server.store.DocNotFoundException;
import dev.weft.server.store.DocStore;
import dev.weft.server.store.DocTooLargeException;
import dev.weft.server.store.IncomingOp;
import dev.weft.server.store.OpStore;
import dev.weft.server.store.StoredOp;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class SyncHandler extends TextWebSocketHandler {
    private final ObjectMapper json;
    private final DocStore docs;
    private final OpStore ops;
    private final SessionRegistry registry;

    public SyncHandler(ObjectMapper json, DocStore docs, OpStore ops, SessionRegistry registry) {
        this.json = json; this.docs = docs; this.ops = ops; this.registry = registry;
    }

    @Override public void afterConnectionEstablished(WebSocketSession session) {
        session.getAttributes().put("sender", new ConcurrentWebSocketSessionDecorator(session, 10000, 10 * 1024 * 1024));
    }

    private WebSocketSession sender(WebSocketSession session) {
        return (WebSocketSession) session.getAttributes().get("sender");
    }

    private void send(WebSocketSession session, Object msg) throws IOException {
        session.sendMessage(new TextMessage(json.writeValueAsString(msg)));
    }

    private void error(WebSocketSession session, String code, String message) throws IOException {
        send(sender(session), new Messages.Error("error", code, message));
    }

    @Override protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode msg;
        try { msg = json.readTree(message.getPayload()); }
        catch (JsonProcessingException e) { error(session, "BAD_MESSAGE", "Invalid JSON"); return; }
        if (msg == null || !msg.isObject() || !msg.path("t").isTextual()) {
            error(session, "BAD_MESSAGE", "Expected a typed object"); return;
        }
        try {
            switch (msg.path("t").asText()) {
                case "hello" -> hello(session, msg);
                case "ops" -> batch(session, msg);
                default -> error(session, "BAD_MESSAGE", "Unknown message type");
            }
        } catch (DocNotFoundException e) {
            error(session, "DOC_NOT_FOUND", e.getMessage());
            session.close(CloseStatus.POLICY_VIOLATION);
        } catch (DocTooLargeException e) {
            error(session, "LIMIT_EXCEEDED", e.getMessage());
        }
    }

    private void hello(WebSocketSession session, JsonNode msg) throws IOException {
        if (session.getAttributes().containsKey("doc") || !nonempty(msg.path("doc"), 128)
                || !nonempty(msg.path("replica"), 64) || !counter(msg.path("lastSeq"))) {
            error(session, "BAD_MESSAGE", "Invalid hello"); return;
        }
        String doc = msg.path("doc").asText();
        if (!docs.exists(doc)) throw new DocNotFoundException(doc);
        registry.withSessions(doc, sessions -> {
            session.getAttributes().put("doc", doc);
            sessions.add(sender(session));
            long head = ops.headSeq(doc);
            long after = msg.path("lastSeq").asLong();
            boolean done;
            do {
                var page = ops.after(doc, after, 5001);
                done = page.size() <= 5000;
                var selected = page.subList(0, Math.min(5000, page.size()));
                send(sender(session), new Messages.Catchup("catchup", wire(selected), head, done));
                if (!selected.isEmpty()) after = selected.getLast().seq();
            } while (!done);
        });
    }

    private List<Messages.SequencedOp> wire(List<StoredOp> stored) throws JsonProcessingException {
        List<Messages.SequencedOp> result = new ArrayList<>();
        for (var op : stored) result.add(new Messages.SequencedOp(op.seq(), json.readTree(op.payloadJson())));
        return result;
    }

    private boolean nonempty(JsonNode value, int max) {
        return value.isTextual() && !value.asText().isEmpty() && value.asText().length() <= max;
    }

    private boolean counter(JsonNode value) {
        return value.isIntegralNumber() && value.canConvertToLong() && value.asLong() >= 0;
    }

    private boolean validOp(JsonNode op) {
        return op.isObject() && (op.path("type").asText().equals("insert") || op.path("type").asText().equals("delete"))
                && nonempty(op.path("opId").path("replica"), 64) && counter(op.path("opId").path("counter"));
    }

    private void batch(WebSocketSession session, JsonNode msg) throws IOException {
        String doc = (String) session.getAttributes().get("doc");
        if (doc == null) { error(session, "NO_HELLO", "Send hello first"); return; }
        if (!msg.path("ops").isArray()) { error(session, "BAD_MESSAGE", "Expected ops array"); return; }
        List<IncomingOp> incoming = new ArrayList<>();
        List<JsonNode> ids = new ArrayList<>();
        for (var op : msg.path("ops")) {
            if (!validOp(op)) { error(session, "BAD_MESSAGE", "Invalid operation"); return; }
            var id = op.path("opId");
            ids.add(id);
            incoming.add(new IncomingOp(id.path("replica").asText(), id.path("counter").asLong(), json.writeValueAsString(op)));
        }
        registry.withSessions(doc, sessions -> {
            var stored = ops.append(doc, incoming);
            send(sender(session), new Messages.Ack("ack", ids));
            if (stored.isEmpty()) return;
            var broadcast = new Messages.Ops("ops", wire(stored));
            for (var other : sessions) {
                if (other.getId().equals(session.getId()) || !other.isOpen()) continue;
                try { send(other, broadcast); }
                catch (IOException e) { other.close(CloseStatus.SERVER_ERROR); }
            }
        });
    }

    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String doc = (String) session.getAttributes().get("doc");
        if (doc != null) registry.remove(doc, sender(session));
    }
}
