package dev.weft.server.store;

public record IncomingOp(String replicaId, long counter, String payloadJson) {}
