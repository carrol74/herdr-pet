const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const action = process.argv[2];
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR;
const socketPath = stateDir ? (process.platform === "win32"
  ? `\\\\.\\pipe\\herdr-pet-${Buffer.from(path.resolve(stateDir).toLowerCase()).toString("base64url")}`
  : path.join(stateDir, "pet-control.sock")) : null;
const release = path.join(__dirname, "src-tauri", "target", "release");
const executable = process.platform === "darwin"
  ? path.join(release, "bundle", "macos", "Herdr Pet.app", "Contents", "MacOS", "herdr-pet")
  : path.join(release, process.platform === "win32" ? "herdr-pet.exe" : "herdr-pet");

function send(command) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let settled = false;
    let response = "";
    const finish = (error) => {
      if (settled) return;
      settled = true;
      client.destroy();
      if (error) reject(error);
      else resolve();
    };
    client.setTimeout(2000, () => {
      const error = new Error("Herdr Pet did not respond");
      error.code = "ETIMEDOUT";
      finish(error);
    });
    client.once("connect", () => client.write(`${command}\n`));
    client.once("error", finish);
    client.on("data", (data) => {
      response += data.toString();
      if (!response.includes("\n") && response.length < 16) return;
      if (response === "ok\n") finish();
      else finish(new Error("Herdr Pet rejected the action"));
    });
    client.once("end", () => finish(new Error("Herdr Pet closed the control connection")));
  });
}

function unavailable(error) {
  return error.code === "ENOENT" || error.code === "ECONNREFUSED";
}

async function main() {
  if (!socketPath) throw new Error("HERDR_PLUGIN_STATE_DIR is required");
  if (!["start", "show", "stop"].includes(action)) {
    throw new Error("expected start, show, or stop");
  }
  try {
    await send(action === "stop" ? "stop" : "show");
    return;
  } catch (error) {
    if (!unavailable(error)) throw error;
    if (action === "stop") return;
  }

  if (!fs.existsSync(executable)) {
    throw new Error(`Herdr Pet binary is missing at ${executable}; run npm run build first`);
  }
  const logPath = path.join(stateDir, "pet.log");
  const log = fs.openSync(logPath, "a", 0o600);
  const child = spawn(executable, [], {
    detached: true,
    stdio: ["ignore", "ignore", log],
    env: { ...process.env, HERDR_PET_CONTROL_ENDPOINT: socketPath },
  });
  fs.closeSync(log);
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Herdr Pet exited during startup (${child.signalCode || child.exitCode}); see ${logPath}`);
    }
    try {
      await send("show");
      return;
    } catch (error) {
      if (!unavailable(error) && error.code !== "ETIMEDOUT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Herdr Pet did not start within 30 seconds; see ${logPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
