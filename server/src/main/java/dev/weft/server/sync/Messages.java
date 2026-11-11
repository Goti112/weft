package dev.weft.server.sync;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public final class Messages {
    private Messages() {}
    public record SequencedOp(long seq, JsonNode op) {}
    public record Catchup(String t, List<SequencedOp> ops, long headSeq, boolean done) {}
    public record Ops(String t, List<SequencedOp> ops) {}
    public record Ack(String t, List<JsonNode> opIds) {}
    public record Error(String t, String code, String message) {}
}
