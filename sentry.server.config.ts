import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://fa771ec768fb178f3f255dcf16328fb3@o4512246704832512.ingest.us.sentry.io/4512246727901184",
  environment: process.env.NODE_ENV === "development" ? "development" : "production",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
})
