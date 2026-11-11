package dev.weft.server.web;

import dev.weft.server.store.DocStore;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DocController {
    private final DocStore docs;
    public DocController(DocStore docs) { this.docs = docs; }
    @PostMapping("/api/docs")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> create() { return Map.of("id", docs.create()); }
}
