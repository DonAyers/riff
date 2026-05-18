#!/usr/bin/env node

import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = 3000;
const SHUTDOWN_TIMEOUT_MS = 1_500;

const execFileOutput = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
      });
    });
  });

export const resolvePort = (argv = process.argv.slice(2), env = process.env) => {
  const portFlagIndex = argv.findIndex((arg) => arg === "--port" || arg === "-p");
  const portValue = portFlagIndex >= 0 ? argv[portFlagIndex + 1] : env.RIFF_DEV_SERVER_PORT;
  const port = Number.parseInt(portValue ?? String(DEFAULT_PORT), 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid dev server port: ${portValue}`);
  }

  return port;
};

const uniquePids = (pids) => [
  ...new Set(
    pids
      .map((pid) => Number.parseInt(String(pid), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
  ),
];

export const parseBarePids = (output) =>
  uniquePids(String(output).trim().split(/\s+/).filter((value) => /^\d+$/.test(value)));

export const parseFuserPids = (output) => {
  const pidOutput = String(output).includes(":")
    ? String(output).split(":").slice(1).join(":")
    : output;

  return parseBarePids(pidOutput);
};

export const parseSsPids = (output) =>
  uniquePids([...String(output).matchAll(/pid=(\d+)/g)].map((match) => match[1]));

export const parseWindowsNetstatPids = (output, port) =>
  uniquePids(
    String(output)
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((columns) => {
        const [protocol, localAddress, , state] = columns;
        return (
          protocol?.toUpperCase() === "TCP" &&
          localAddress?.endsWith(`:${port}`) &&
          state?.toUpperCase() === "LISTENING"
        );
      })
      .map((columns) => columns.at(-1))
  );

export const parseUnixNetstatPids = (output, port) =>
  uniquePids(
    String(output)
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((columns) => {
        const localAddress = columns[3];
        const state = columns[5];
        return localAddress?.endsWith(`:${port}`) && state?.toUpperCase() === "LISTEN";
      })
      .map((columns) => columns[6]?.match(/^(\d+)\//)?.[1])
  );

const findWindowsPids = async (port) => {
  const powershell = await execFileOutput("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
  ]);

  const powershellPids = parseBarePids(powershell.stdout);
  if (powershell.ok && powershellPids.length > 0) {
    return powershellPids;
  }

  const netstat = await execFileOutput("netstat", ["-ano", "-p", "tcp"]);
  return netstat.ok ? parseWindowsNetstatPids(netstat.stdout, port) : [];
};

const findUnixPids = async (port) => {
  const lsof = await execFileOutput("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  const lsofPids = parseBarePids(lsof.stdout);
  if (lsofPids.length > 0) {
    return lsofPids;
  }

  const ss = await execFileOutput("ss", ["-ltnp", `sport = :${port}`]);
  const ssPids = parseSsPids(ss.stdout);
  if (ssPids.length > 0) {
    return ssPids;
  }

  const netstat = await execFileOutput("netstat", ["-ltnp"]);
  const netstatPids = netstat.ok ? parseUnixNetstatPids(netstat.stdout, port) : [];
  if (netstatPids.length > 0) {
    return netstatPids;
  }

  const fuser = await execFileOutput("fuser", ["-n", "tcp", String(port)]);
  return parseFuserPids(`${fuser.stdout}\n${fuser.stderr}`);
};

const findListeningPids = (port) =>
  process.platform === "win32" ? findWindowsPids(port) : findUnixPids(port);

const isProcessRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sendSignal = (pid, signal) => {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false;
    }

    throw error;
  }
};

const stopPid = async (pid) => {
  if (process.platform === "win32") {
    await execFileOutput("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }

  if (!sendSignal(pid, "SIGTERM")) {
    return;
  }

  await delay(SHUTDOWN_TIMEOUT_MS);

  if (isProcessRunning(pid)) {
    sendSignal(pid, "SIGKILL");
  }
};

export const stopDevServer = async (port = DEFAULT_PORT) => {
  const pids = await findListeningPids(port);

  if (pids.length === 0) {
    console.log(`No dev server found on port ${port}.`);
    return { killed: [], port };
  }

  for (const pid of pids) {
    await stopPid(pid);
  }

  console.log(`Stopped dev server on port ${port} (PID${pids.length === 1 ? "" : "s"} ${pids.join(", ")}).`);
  return { killed: pids, port };
};

const main = async () => {
  const port = resolvePort();
  await stopDevServer(port);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}