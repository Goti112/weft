package dev.weft.server.store;

public class DocTooLargeException extends RuntimeException {
    public DocTooLargeException() { super("Document exceeds 5 MB of stored operations"); }
}
