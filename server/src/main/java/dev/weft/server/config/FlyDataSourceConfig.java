package dev.weft.server.config;

import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
@ConditionalOnProperty(name = "DATABASE_URL")
public class FlyDataSourceConfig {
    @Bean public DataSource flyDataSource(Environment environment, DataSourceProperties properties) {
        if (environment.containsProperty("SPRING_DATASOURCE_URL")) {
            return properties.initializeDataSourceBuilder().type(HikariDataSource.class).build();
        }
        var settings = DatabaseUrl.parse(environment.getRequiredProperty("DATABASE_URL"));
        return DataSourceBuilder.create().type(HikariDataSource.class)
                .url(settings.jdbcUrl()).username(settings.username()).password(settings.password()).build();
    }
}
