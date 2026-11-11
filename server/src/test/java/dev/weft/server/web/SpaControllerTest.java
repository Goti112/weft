package dev.weft.server.web;

import dev.weft.server.PostgresTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;

@AutoConfigureMockMvc
class SpaControllerTest extends PostgresTest {
    @Autowired MockMvc mvc;
    @Test void documentRouteForwardsToTheApplicationShell() throws Exception {
        mvc.perform(get("/d/shared")).andExpect(forwardedUrl("/index.html"));
    }
}
