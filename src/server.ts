import { spawn, type ChildProcess } from "node:child_process";

export interface ManagedServer {
  stop: () => Promise<void>;
}

export async function startManagedServer(command: string, readyUrl: string, timeoutMs = 15_000): Promise<ManagedServer> {
  const child = spawn(command, {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server command exited early with code ${child.exitCode}.\n${output}`);
    }
    if (await canFetch(readyUrl)) {
      return {
        stop: () => stopChild(child)
      };
    }
    await sleep(250);
  }

  await stopChild(child);
  throw new Error(`Server did not become ready at ${readyUrl} within ${timeoutMs}ms.\n${output}`);
}

async function canFetch(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    sleep(2_000).then(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
    })
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
