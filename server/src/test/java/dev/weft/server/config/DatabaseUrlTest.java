package dev.weft.server.config;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class DatabaseUrlTest {
    @Test void flyUrlBecomesJdbcUrlWithDecodedCredentials() {
        var result = DatabaseUrl.parse("postgres://weft:p%40ss%3Aword@weft-db.internal:5432/weft?sslmode=require");
        assertThat(result.jdbcUrl()).isEqualTo("jdbc:postgresql://weft-db.internal:5432/weft?sslmode=require");
        assertThat(result.username()).isEqualTo("weft");
        assertThat(result.password()).isEqualTo("p@ss:word");
    }
    @Test void missingPortDefaultsToPostgresAndSupportsIpv6() {
        var result = DatabaseUrl.parse("postgresql://weft:pass@[::1]/weft");
        assertThat(result.jdbcUrl()).isEqualTo("jdbc:postgresql://[::1]:5432/weft");
    }
    @Test void rejectsNonPostgresUrls() {
        assertThatThrownBy(() -> DatabaseUrl.parse("https://user:pass@example.com/db")).isInstanceOf(IllegalArgumentException.class);
    }
}
