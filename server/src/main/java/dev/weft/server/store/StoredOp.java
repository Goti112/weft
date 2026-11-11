package dev.weft.server.store;

public record StoredOp(long seq, String payloadJson) {}
