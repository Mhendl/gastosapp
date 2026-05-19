module.exports = {
  apps: [{
    name: 'gastosapp-backend',
    script: './backend/server.js',
    cwd: '/var/www/gastosapp',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    error_file: '/var/log/gastosapp/error.log',
    out_file: '/var/log/gastosapp/out.log',
    log_file: '/var/log/gastosapp/combined.log'
  }]
};
