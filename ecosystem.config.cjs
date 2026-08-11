// ecosystem.config.cjs — DealerMitra V2 production PM2 configuration.
//
// Usage:
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save && pm2 startup
//
// Secrets are NOT stored here — each app reads its own .env (dotenv). This file
// sets only non-secret runtime settings and points logs at /var/www/logs.
//
// Adjust `cwd` to your deployment paths. Defaults assume the repo is deployed at
// /var/www/dealermitra with the shared uploads root at /var/www/uploads.

const LOG_DIR = process.env.PM2_LOG_DIR || '/var/www/logs';

module.exports = {
  apps: [
    // -------------------------------------------------------------------------
    // Admin Backend — source of truth — port 5001
    // -------------------------------------------------------------------------
    {
      name: 'admin-backend',
      cwd: '/var/www/development/admin/admin-backend',
      script: 'server.js',
      // Load .env before any module is evaluated. ES module imports are
      // hoisted above server.js's dotenv.config() call, so constants read at
      // module scope (FILE_PUBLIC_BASE, ADMIN_BACKEND_URL, INTERNAL_API_KEY,
      // JWT_SECRET) would otherwise be captured before .env is loaded.
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // Restart policy
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '15s',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: 5001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5001,
        // Shared uploads root (must match the mobile backend).
        UPLOADS_ROOT: '/var/www/uploads',
        // Non-secret; secrets (MONGO_URI, JWT_SECRET, SETTINGS_ENC_KEY,
        // INTERNAL_API_KEY, CORS_ORIGIN) come from admin-backend/.env
      },
      // Production logging (separate error/out, timestamped)
      error_file: `${LOG_DIR}/admin-backend-error.log`,
      out_file: `${LOG_DIR}/admin-backend-out.log`,
      log_file: `${LOG_DIR}/admin-backend-combined.log`,
      time: true,
      merge_logs: true,
    },

    // -------------------------------------------------------------------------
    // Mobile Backend — dealer gateway — port 5000
    // -------------------------------------------------------------------------
    {
      name: 'mobile-backend',
      cwd: '/var/www/development/native-app/backend/server',
      script: 'server.js',
      // Load .env before any module is evaluated. ES module imports are
      // hoisted above server.js's dotenv.config() call, so constants read at
      // module scope (FILE_PUBLIC_BASE, ADMIN_BACKEND_URL, INTERNAL_API_KEY,
      // JWT_SECRET) would otherwise be captured before .env is loaded.
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '15s',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        UPLOADS_ROOT: '/var/www/uploads',
        // Non-secret; secrets (MONGO_URI, JWT_SECRET, INTERNAL_API_KEY,
        // ADMIN_BACKEND_URL, FILE_PUBLIC_BASE, CORS_ORIGIN) come from server/.env
      },
      error_file: `${LOG_DIR}/mobile-backend-error.log`,
      out_file: `${LOG_DIR}/mobile-backend-out.log`,
      log_file: `${LOG_DIR}/mobile-backend-combined.log`,
      time: true,
      merge_logs: true,
    },
  ],
};
