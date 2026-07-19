export const env = {
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4010),
  jwtSecret: process.env.JWT_SECRET ?? "dev-access-secret-change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
  accessTtlSec: 15 * 60,
  refreshTtlSec: 30 * 24 * 60 * 60,
};

if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be set in production");
  }
}
