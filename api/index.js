import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(__dirname, "../artifacts/api-server/dist/app.mjs");

let app;
try {
  const mod = await import(appPath);
  app = mod.default;
} catch (err) {
  app = (req, res) => {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      error: err.message,
      code: err.code,
      appPath,
      exists: existsSync(appPath),
      dir: __dirname,
    }));
  };
}

export default app;
