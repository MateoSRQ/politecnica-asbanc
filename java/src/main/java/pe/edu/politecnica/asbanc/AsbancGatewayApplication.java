package pe.edu.politecnica.asbanc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AsbancGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(AsbancGatewayApplication.class, args);
    }
}
