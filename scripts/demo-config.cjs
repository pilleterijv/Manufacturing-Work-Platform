const path = require("node:path");
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
module.exports = { validateDemoUrl, demoEnvironment, demoOrigin };
