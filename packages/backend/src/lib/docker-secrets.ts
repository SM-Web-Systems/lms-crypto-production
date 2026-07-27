import fs from "node:fs";

export function resolveDatabaseUrl(): string {
  // Prefer explicit DATABASE_URL if set
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Construct from parts + Docker secret file
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const user = process.env.DB_USER || "stellarwallet";
  const name = process.env.DB_NAME || "stellarwallet";
  const passwordFile = process.env.DB_PASSWORD_FILE || "/run/secrets/db_password";

  if (!fs.existsSync(passwordFile)) {
    throw new Error(
      `Neither DATABASE_URL nor a readable DB_PASSWORD_FILE (${passwordFile}) is available. ` +
      `Set DATABASE_URL directly, or provide DB_HOST/DB_USER/DB_NAME/DB_PASSWORD_FILE.`
    );
  }

  const password = fs.readFileSync(passwordFile, "utf8").trim();
  // encodeURIComponent leaves some characters unencoded (e.g. ! ' ( ) * ~)
  // that can be problematic in database URLs. Encode them explicitly.
  const encodedPassword = encodeURIComponent(password).replace(
    /[!'()*~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${name}`;
}
