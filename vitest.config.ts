import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Desactivar paralelismo entre archivos para evitar condiciones de carrera sobre registros compartidos de la base de datos
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
