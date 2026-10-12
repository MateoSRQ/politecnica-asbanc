package pe.edu.politecnica.asbanc.infrastructure.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

public class DotenvEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final Logger log = LoggerFactory.getLogger(DotenvEnvironmentPostProcessor.class);

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        File envFile = findDotenvFile();
        if (envFile == null || !envFile.exists() || !envFile.canRead()) {
            return;
        }

        Map<String, Object> dotenvMap = parseDotenv(envFile);
        if (!dotenvMap.isEmpty()) {
            environment.getPropertySources().addFirst(new MapPropertySource("dotenvProperties", dotenvMap));
            System.out.println("[DOTENV] Cargadas " + dotenvMap.size() + " variables desde " + envFile.getAbsolutePath());
        }
    }

    private File findDotenvFile() {
        String userDir = System.getProperty("user.dir", ".");
        Path[] candidatePaths = new Path[] {
            Paths.get(userDir, ".env"),
            Paths.get(userDir, "..", ".env"),
            Paths.get(userDir, "../..", ".env")
        };

        for (Path p : candidatePaths) {
            File f = p.toFile();
            if (f.exists() && f.isFile()) {
                return f;
            }
        }
        return null;
    }

    private Map<String, Object> parseDotenv(File file) {
        Map<String, Object> props = new HashMap<>();
        try (BufferedReader reader = new BufferedReader(new FileReader(file, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int eqIdx = line.indexOf('=');
                if (eqIdx > 0) {
                    String key = line.substring(0, eqIdx).trim();
                    String val = line.substring(eqIdx + 1).trim();
                    if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.substring(1, val.length() - 1);
                    }
                    props.put(key, val);
                }
            }
        } catch (IOException e) {
            log.warn("No se pudo leer archivo .env en {}: {}", file.getAbsolutePath(), e.getMessage());
        }
        return props;
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
