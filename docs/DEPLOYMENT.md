# Deployment Guide

## Current Production Setup

The application runs on a single AWS EC2 instance in the af-south-1 (Cape Town) region. The instance is ARM64 (Graviton) running Ubuntu 24.04 LTS with public IP 13.245.39.194. The domain ammawallet.com is managed via Cloudflare DNS.

Four services run on the instance: the Fastify API on port 3001 managed by PM2, PostgreSQL 16 on port 5432 managed by systemd, Nginx on ports 80 and 443 managed by systemd, and SSL certificates from Let's Encrypt with automatic renewal via Certbot.

## Deployment Steps

To deploy a new version, SSH into the server and pull the latest code from the main branch. Install dependencies in both packages/backend and packages/web-app with npm install. Run npx drizzle-kit push in the backend package to apply any database schema changes. Build the frontend with npm run build in the web-app package. Restart the backend with pm2 restart amma-backend. Verify the deployment by checking the health endpoint at https://ammawallet.com/health, which should return a JSON object with status "ok" and the current network.

## Environment Variables

The backend requires the following environment variables in packages/backend/.env:

DATABASE_URL is the PostgreSQL connection string in the format postgresql://user:password@host:5432/database. JWT_SECRET and JWT_REFRESH_SECRET are separate secrets for signing access and refresh tokens. STELLAR_NETWORK is either "testnet" or "public". HORIZON_URL is the Stellar Horizon API URL (https://horizon-testnet.stellar.org for testnet or https://horizon.stellar.org for mainnet). WEB_APP_URL is the frontend URL used in email templates (https://ammawallet.com). API_BASE_URL is the backend's own URL (https://ammawallet.com). PORT is the API listening port (default 3001).

SMTP configuration uses SMTP_HOST (smtp.gmail.com), SMTP_PORT (587), SMTP_USER, SMTP_PASS (app-specific password), and SMTP_FROM (the sender address shown in emails).

Optional variables include PLATFORM_FEE_PERCENT (default 0.3), PLATFORM_WALLET (Stellar public key receiving fees), TURNSTILE_SECRET_KEY (Cloudflare Turnstile secret), and LIQUIFIER_INTERVAL_HOURS (default 6).

## Nginx Configuration

Nginx listens on port 443 with SSL and proxies requests matching /api/, /docs/, and /health to 127.0.0.1:3001. All other requests serve the React SPA from packages/web-app/dist/ with a fallback to index.html for client-side routing. Port 80 redirects to HTTPS. SSL certificates are managed by Certbot and stored in /etc/letsencrypt/live/ammawallet.com/.

## Backups

A daily cron job at 3 AM runs pg_dump to create compressed database backups in /home/christopher-fourquier/backups/. Backups older than 30 days are automatically deleted. To create a manual backup, run pg_dump -U stellarwallet -h localhost stellarwallet | gzip > backup.sql.gz. To restore from a backup, run gunzip -c backup.sql.gz | psql -U stellarwallet -h localhost stellarwallet.

## Monitoring

PM2 provides process monitoring. Use pm2 status to check if the backend is running, pm2 logs amma-backend to view recent logs, and pm2 monit for real-time resource monitoring. The health endpoint at /health returns the server status, current network, and timestamp.

## Switching to Mainnet

To switch from testnet to mainnet, update the .env file: set STELLAR_NETWORK to "public" and HORIZON_URL to "https://horizon.stellar.org". Create a funded mainnet wallet as the platform wallet and update PLATFORM_WALLET. Clear testnet token data from the database with DELETE FROM tokens. Restart the backend with pm2 restart amma-backend. The token indexer will automatically discover and enrich mainnet assets on the next startup cycle.
