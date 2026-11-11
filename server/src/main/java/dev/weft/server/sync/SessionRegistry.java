package dev.weft.server.sync;

import java.util.Map;
import java.util.Set;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

@Component
public class SessionRegistry {
    private final Map<String, Set<WebSocketSession>> docs = new ConcurrentHashMap<>();

    @FunctionalInterface
    public interface SessionAction { void run(Set<WebSocketSession> sessions) throws IOException; }

    public void withSessions(String doc, SessionAction action) throws IOException {
        try {
            docs.compute(doc, (key, existing) -> {
                Set<WebSocketSession> sessions = existing == null ? ConcurrentHashMap.newKeySet() : existing;
                try { action.run(sessions); }
                catch (IOException e) { throw new UncheckedIOException(e); }
                return sessions.isEmpty() ? null : sessions;
            });
        } catch (UncheckedIOException e) { throw e.getCause(); }
    }

    public void remove(String doc, WebSocketSession session) {
        docs.computeIfPresent(doc, (key, sessions) -> {
            sessions.remove(session);
            return sessions.isEmpty() ? null : sessions;
        });
    }
}
