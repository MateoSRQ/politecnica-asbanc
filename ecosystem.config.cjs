module.exports = {
  apps: [
    {
      name: 'politecnica-asbanc',
      script: 'dist/index.js',
      instances: 'max', // Clúster de procesos Node.js aprovechando todos los núcleos CPU
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '350M',
      listen_timeout: 5000,
      kill_timeout: 3000,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
    },
  ],
};
