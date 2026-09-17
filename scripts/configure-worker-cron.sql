-- Production operations only: seed royal_midnight_worker_secret in Vault with
-- the deployed CRON_WORKER_SECRET before running. Never inline credentials here.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended('royal-midnight-worker-cron', 0));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'royal_midnight_worker_secret' AND length(decrypted_secret) >= 32
  ) THEN
    RAISE EXCEPTION 'Provision the production worker credential in Vault first';
  END IF;
END;
$$;

SELECT cron.schedule(
  'trip-reminders', '*/5 * * * *',
  $job$SELECT net.http_post(
    url := 'https://www.royalmidnight.com/api/cron/trip-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'royal_midnight_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 45000
  );$job$
);

SELECT cron.schedule(
  'booking-jobs', '* * * * *',
  $job$SELECT net.http_post(
    url := 'https://www.royalmidnight.com/api/cron/booking-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'royal_midnight_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 45000
  );$job$
);

SELECT cron.schedule(
  'mail-outbox', '* * * * *',
  $job$SELECT net.http_post(
    url := 'https://www.royalmidnight.com/api/cron/mail-outbox',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'royal_midnight_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 45000
  );$job$
);
COMMIT;
