import { execFile } from "node:child_process";
import { chmod, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const executable = fileURLToPath(new URL("./bin/hma-bridge", import.meta.url));
const commands = new Set(["status", "prepare", "connect", "disconnect", "reconnect", "countries", "next-country"]);

function helperError(error) {
    const message = error?.code === "ENOENT" ? "The HMA helper is missing. Reinstall HMA VPN Controls."
        : ["EACCES", "EPERM"].includes(error?.code) ? "The HMA helper cannot run because of its file permissions. Reinstall HMA VPN Controls."
            : error?.killed ? "HMA took too long to respond. Open HMA and check its connection."
                : "The HMA helper could not return a readable response. Reinstall HMA VPN Controls.";
    return new Error(message);
}

export function createBridge(run = execFile, files = { chmod, lstat }) {
    return {
        async invoke(command, options = {}) {
            if (!commands.has(command)) return Promise.reject(new Error("Unknown HMA action."));
            const readOnly = command === "status" || command === "countries";
            const seconds = command === "status" ? 2 : command === "countries" ? 3
                : ["reconnect", "next-country"].includes(command) ? 75 : 40;
            const args = [command, "--timeout", String(seconds)];
            if (command === "next-country") {
                args.push("--countries", JSON.stringify(options.countries || []));
                if (options.currentCountry != null) {
                    if (typeof options.currentCountry !== "string" || !/^[A-Z]{2}$/i.test(options.currentCountry)) throw new Error("Invalid current country.");
                    args.push("--current-country", options.currentCountry.toUpperCase());
                }
            }
            const execute = () => new Promise(resolve => {
                run(executable, args, { timeout: (seconds + (readOnly ? 1 : 5)) * 1000, maxBuffer: 1024 * 1024, windowsHide: true },
                    (error, stdout) => resolve({ error, stdout }));
            });
            let output = await execute();
            if (output.error?.code === "EACCES") {
                // Older installers dropped the execute bit. Repair only our regular helper file.
                try {
                    const info = await files.lstat(executable);
                    if (info.isFile() && !(info.mode & 0o100)) {
                        await files.chmod(executable, (info.mode & 0o7777) | 0o100);
                        output = await execute();
                    }
                } catch (error) {
                    throw helperError(error);
                }
            }
            if (output.error?.killed || output.error?.signal) throw helperError(output.error);
            // Operational failures also carry a structured status. Never log IP data.
            try {
                const result = JSON.parse(String(output.stdout).trim());
                if (result === null || typeof result !== "object" || Array.isArray(result)
                    || typeof result.ok !== "boolean" || result.status === null || typeof result.status !== "object"
                    || Array.isArray(result.status)
                    || !["connected", "disconnected", "connecting", "disconnecting", "unknown"].includes(result.status.state)
                    || (output.error && result.ok)) throw new Error("Invalid response");
                return result;
            } catch {
                throw helperError(output.error);
            }
        },
    };
}

export function openHma() {
    return new Promise((resolve, reject) => execFile("/usr/bin/open", ["-b", "com.privax.osx.provpn"], error => error ? reject(new Error("HMA VPN could not be opened.")) : resolve()));
}
