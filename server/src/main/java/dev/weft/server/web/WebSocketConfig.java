package dev.weft.server.web;

import dev.weft.server.sync.SyncHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final SyncHandler handler;
    private final String[] origins;

    public WebSocketConfig(SyncHandler handler, @Value("${weft.allowed-origins}") String[] origins) {
        this.handler = handler; this.origins = origins;
    }

    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws").setAllowedOrigins(origins);
    }

}
