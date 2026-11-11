package dev.weft.server.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

public record DatabaseUrl(String jdbcUrl, String username, String password) {
    public static DatabaseUrl parse(String value) {
        try {
            URI uri = URI.create(value);
            if (!("postgres".equals(uri.getScheme()) || "postgresql".equals(uri.getScheme()))
                    || uri.getHost() == null || uri.getRawUserInfo() == null
                    || uri.getRawPath() == null || uri.getRawPath().length() < 2) {
                throw new IllegalArgumentException();
            }
            String host = uri.getHost();
            if (host.contains(":") && !host.startsWith("[")) host = "[" + host + "]";
            int port = uri.getPort() < 0 ? 5432 : uri.getPort();
            String[] credentials = uri.getRawUserInfo().split(":", 2);
            String username = decode(credentials[0]);
            String password = credentials.length > 1 ? decode(credentials[1]) : "";
            return new DatabaseUrl("jdbc:postgresql://" + host + ":" + port + uri.getRawPath()
                    + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery()), username, password);
        } catch (IllegalArgumentException e) {
            // Never include the connection string or nested URI error: it contains credentials.
            throw new IllegalArgumentException("Invalid PostgreSQL DATABASE_URL");
        }
    }

    private static String decode(String value) {
        return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
    }
}
