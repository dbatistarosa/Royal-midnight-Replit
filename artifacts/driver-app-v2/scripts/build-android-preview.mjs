import { spawn } from "node:child_process";
import process from "node:process";

const easCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const projectRoot = process.cwd();

const child = spawn(
  easCommand,
  ["--yes", "eas-cli@latest", "build", "--platform", "android", "--profile", "preview"],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      EAS_NO_VCS: "1",
      EAS_PROJECT_ROOT: projectRoot,
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
