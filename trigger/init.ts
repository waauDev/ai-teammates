import { tasks } from "@trigger.dev/sdk";
import * as Sentry from "@sentry/node";

// Loaded once per worker before any task runs. Same DSN as the Next app, so
// task failures land in the same Sentry project, tagged by environment.
Sentry.init({
  dsn: "https://fa771ec768fb178f3f255dcf16328fb3@o4512246704832512.ingest.us.sentry.io/4512246727901184",
  environment: process.env.NODE_ENV === "development" ? "development" : "production",
});

// Global run-level hook: a failed run (after retries) is reported to Sentry.
tasks.onFailure(({ payload, error, ctx }) => {
  Sentry.captureException(error, { extra: { payload, ctx } });
});
