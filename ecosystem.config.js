module.exports = {
  apps: [
    {
      name: 'sarp-tickets',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork', // single instance only -- one process must own the Discord gateway connection
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 15000, // matches the old systemd unit's TimeoutStopSec, gives shutdown() time to disconnect the DB
      max_memory_restart: '1.5G'
    },
  ],
};
