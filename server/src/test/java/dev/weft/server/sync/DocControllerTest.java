package dev.weft.server.sync;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import com.fasterxml.jackson.databind.JsonNode;
import static org.assertj.core.api.Assertions.*;

class DocControllerTest extends SocketTestBase {
    @Autowired TestRestTemplate http;
    @Test void createReturnsIdAndHelloWorks() throws Exception {
        var response = http.postForEntity("/api/docs", null, JsonNode.class);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        var id = response.getBody().path("id").asText();
        assertThat(id).matches("[A-Za-z0-9_-]{10}");
        try (var c = new Client()) {
            c.hello(id, 0);
            assertThat(c.receive().path("t").asText()).isEqualTo("catchup");
        }
        assertThat(http.getForObject("/health", JsonNode.class).path("status").asText()).isEqualTo("ok");
    }
}
