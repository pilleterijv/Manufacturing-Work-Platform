const path = require("node:path");
function demoSourceFile(root, env, exists = require("node:fs").existsSync) {
  if (env.FLOORWORK_ENV_FILE) return env.FLOORWORK_ENV_FILE;
  const codespaces = path.join(root, ".env.codespaces");
  return env.CODESPACES === "true" && exists(codespaces) ? codespaces : path.join(root, ".env");
}
function demoSetupError(error) {
  const codes = new Set([error?.code, ...(error?.errors || []).map((e) => e.code)]);
  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "57P03"].some((c) => codes.has(c)))
    return "Demo cannot reach local PostgreSQL. Check that the Codespaces database service is running and the selected private environment file targets that service.";
  if (codes.has("28P01") || codes.has("28000"))
    return "Demo PostgreSQL login was rejected. Review the selected private environment file locally; do not paste credentials into chat.";
  if (codes.has("42501"))
    return "Demo PostgreSQL account needs permission to create a separate database. Ask your administrator for a local pilot account with CREATEDB; do not alter the operational database.";
  if (codes.has("3D000"))
    return "Demo cannot connect to the configured local pilot database because it does not exist. Check the selected private environment file with your administrator.";
  if (codes.has("55006"))
    return "Demo database is still in use. Stop the demo app with Ctrl+C before resetting it.";
  return error.message && /^(Demo|Use |Run |Refusing|Ask )/.test(error.message)
    ? error.message
    : "Demo setup could not finish. Check local PostgreSQL permissions/service availability; do not change the operational database to fix the demo.";
}
function validateDemoUrl(value) {
  const u = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !["localhost", "127.0.0.1", "db"].includes(u.hostname) ||
    !/^\/floorwork_demo_[a-f0-9]{12}$/.test(u.pathname)
  )
    throw Error("Refusing an unrecognized demo database target.");
  return u;
}
function demoOrigin(env) {
  if (env.CODESPACES === "true") {
    const name = env.CODESPACE_NAME,
      domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
    if (!/^[a-z0-9-]+$/.test(name || "") || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain || ""))
      throw Error("Demo preview context is missing. Reopen this Codespace and rerun the command.");
    return `https://${name}-3001.${domain}`;
  }
  return "http://localhost:3001";
}
function demoEnvironment(base, url, folder) {
  validateDemoUrl(url);
  const env = { ...base };
  for (const key of Object.keys(env))
    if (/^(SMTP_|COMPANY_SQL_|MAINTAINX_|OPENAI_|AZURE_STORAGE_|EXTERNAL_)/.test(key)) env[key] = "";
  return {
    ...env,
    DATABASE_URL: url,
    DATABASE_SETUP_URL: url,
    PORT: "3001",
    UPLOADS_DIR: path.join(folder, "uploads"),
    FLOORWORK_DEMO_MODE: "true",
    FLOORWORK_WORKER_MODE: "external",
    EXTERNAL_DATA_FEEDS_JSON: "[]",
    SMTP_HOST: "",
    SMTP_FROM: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    COMPANY_SQL_SERVER: "",
    COMPANY_SQL_DATABASE: "",
    COMPANY_SQL_USER: "",
    COMPANY_SQL_PASSWORD: "",
    MAINTAINX_API_KEY: "",
    OPENAI_API_KEY: "",
    AZURE_STORAGE_CONNECTION_STRING: "",
  };
}
module.exports = { validateDemoUrl, demoEnvironment, demoOrigin, demoSourceFile, demoSetupError };
