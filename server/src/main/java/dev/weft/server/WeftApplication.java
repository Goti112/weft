package dev.weft.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class WeftApplication {
    public static void main(String[] args) {
        SpringApplication.run(WeftApplication.class, args);
    }
}
