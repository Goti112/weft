package dev.weft.server.store;

public class DocNotFoundException extends RuntimeException {
    public DocNotFoundException(String doc) { super("Document not found: " + doc); }
}
