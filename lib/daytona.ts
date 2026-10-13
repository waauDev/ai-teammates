import { Daytona, type Sandbox } from "@daytona/sdk"

// `new Daytona()` throws without DAYTONA_API_KEY and owns a WebSocket, so build
// it lazily on first use and share the one instance across actions.
let daytona: Daytona | undefined

function client() {
  // Explicit apiUrl: the SDK treats a DAYTONA_API_URL present in both the
  // process env and .env.local as ambiguous and throws.
  daytona ??= new Daytona({
    apiUrl: process.env.DAYTONA_API_URL ?? "https://app.daytona.io/api",
  })
  return daytona
}

// `get()` hits the API to resolve the sandbox and its toolbox proxy URL, so
// cache one Sandbox handle per id for the life of the process.
const sandboxes = new Map<string, Sandbox>()

export function getBotSandbox(sandboxId: string): Promise<Sandbox> {
  const cached = sandboxes.get(sandboxId)
  if (cached) {
    return cached.state === "started"
      ? Promise.resolve(cached)
      : cached.start().then(() => cached)
  }
  return client()
    .get(sandboxId)
    .then(async (sandbox) => {
      if (sandbox.state !== "started") await sandbox.start()
      sandboxes.set(sandboxId, sandbox)
      return sandbox
    })
}

// The desktop (Xvfb, xfce4, x11vnc) is not running in a fresh sandbox. Start it
// once per sandbox per process; on a restarted worker a late start() can fail
// because the desktop is already up, so tolerate that only if Xvfb is running.
const computerUseReady = new Map<string, Promise<void>>()

export function ensureComputerUse(sandboxId: string): Promise<void> {
  let ready = computerUseReady.get(sandboxId)
  if (!ready) {
    ready = (async () => {
      const sandbox = await getBotSandbox(sandboxId)
      try {
        await sandbox.computerUse.start()
      } catch (startError) {
        const xvfb = await sandbox.computerUse.getProcessStatus("xvfb")
        if (!xvfb.running) throw startError
      }
    })()
    computerUseReady.set(sandboxId, ready)
    // Forget failed starts so the next tool call retries.
    ready.catch(() => computerUseReady.delete(sandboxId))
  }
  return ready
}

export async function writeSandboxFile(
  sandbox: Sandbox,
  path: string,
  content: string
): Promise<void> {
  const encodedPath = Buffer.from(path, "utf8").toString("base64")
  const encodedContent = Buffer.from(content, "utf8").toString("base64")
  const response = await sandbox.process.executeCommand(
    `python3 -c "import base64,pathlib,sys; p=pathlib.Path(base64.b64decode(sys.argv[1]).decode()); p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(base64.b64decode(sys.argv[2]))" '${encodedPath}' '${encodedContent}'`
  )

  if (response.exitCode !== 0) {
    throw new Error(
      response.result || `Could not write ${path} in the sandbox.`
    )
  }
}

export async function createBotSandbox(botId: string): Promise<string> {
  // Named after the bot so it's findable in the Daytona dashboard.
  // Daytona's default sandbox allocation is 1 vCPU, 1 GiB RAM, and 3 GiB disk.
  const sandbox = await client().create({ name: `bot-${botId}` })
  try {
    await writeSandboxFile(sandbox, "/home/daytona/MEMORY.md", "\n")
  } catch (error) {
    await sandbox.delete(undefined, true).catch(() => {})
    throw error
  }
  return sandbox.id
}

export async function deleteBotSandbox(sandboxId: string): Promise<void> {
  const sandbox = await client().get(sandboxId)
  // wait=true so we don't return (and drop the row) before the sandbox is gone.
  await sandbox.delete(undefined, true)
}
