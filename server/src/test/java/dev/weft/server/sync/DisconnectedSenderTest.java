package dev.weft.server.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.weft.server.store.DocStore;
import dev.weft.server.store.OpStore;
import dev.weft.server.store.StoredOp;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DisconnectedSenderTest {
    private WebSocketSession session(String id, List<String> received) throws Exception {
        var session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id); when(session.isOpen()).thenReturn(true);
        when(session.getAttributes()).thenReturn(new HashMap<>());
        doAnswer(call -> { received.add(((TextMessage) call.getArgument(0)).getPayload()); return null; })
                .when(session).sendMessage(any());
        return session;
    }

    @Test void aFailedAckDoesNotPreventBroadcastOfCommittedOps() throws Exception {
        var json = new ObjectMapper(); var docs = mock(DocStore.class); var ops = mock(OpStore.class);
        when(docs.exists("doc")).thenReturn(true); when(ops.headSeq("doc")).thenReturn(0L);
        when(ops.after(eq("doc"), anyLong(), anyInt())).thenReturn(List.of());
        var handler = new SyncHandler(json, docs, ops, new SessionRegistry());
        var aMessages = new ArrayList<String>(); var bMessages = new ArrayList<String>();
        var a = session("a", aMessages); var b = session("b", bMessages);
        handler.afterConnectionEstablished(a); handler.afterConnectionEstablished(b);
        var hello = new TextMessage("{\"t\":\"hello\",\"doc\":\"doc\",\"replica\":\"a\",\"lastSeq\":0}");
        handler.handleTextMessage(a, hello); handler.handleTextMessage(b, hello);
        String op = "{\"type\":\"insert\",\"opId\":{\"replica\":\"a\",\"counter\":0},\"parent\":null,\"side\":\"R\",\"text\":\"x\"}";
        when(ops.append(eq("doc"), anyList())).thenReturn(List.of(new StoredOp(1, op)));
        doThrow(new IOException("sender disconnected")).when(a).sendMessage(any());
        assertThatThrownBy(() -> handler.handleTextMessage(a, new TextMessage("{\"t\":\"ops\",\"ops\":[" + op + "]}"))).isInstanceOf(IOException.class);
        assertThat(bMessages.stream().anyMatch(raw -> raw.contains("\"t\":\"ops\""))).isTrue();
    }
}
