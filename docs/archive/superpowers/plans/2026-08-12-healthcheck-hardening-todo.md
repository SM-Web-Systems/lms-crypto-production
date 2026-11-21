# Healthcheck Hardening To-Do

## Completed

- [x] Fix monitor Check #6 to use `checks.ammaWallet.network` path (backward-compatible)
- [x] Verify fix by running `amma-monitor.sh` manually — all 8 checks pass
- [x] Write incident spec

## Future Hardening (deferred)

- [ ] Add monitor self-test: after any LMS health endpoint change, run `amma-monitor.sh` as part of deploy verification
- [ ] Add response shape assertion: monitor should log the full JSON keys at INFO level so shape changes are visible before they break extraction
- [ ] Add alert dedup/cooldown: suppress repeated identical alerts after the first 3 (reduce email flood from 217 to 3)
- [ ] Add synthetic uptime check independent of `amma-monitor.sh` (e.g. UptimeRobot or Cloudflare health check on `/api/v1/health`)
- [ ] Document the monitor's expected response shapes in the spec so future health endpoint refactors update the monitor too
