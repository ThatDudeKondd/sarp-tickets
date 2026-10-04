// Preloaded before every test file (see the "test" script). The bot reads and
// WRITES config.json and data/containers/*.json, so tests run from a temp copy
// with a generated config, never the real files. It also refuses to start
// without a token, so harmless fake env values are set here.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repo = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sarp-tickets-test-"));
fs.cpSync(path.join(repo, "data", "containers"), path.join(tmp, "data", "containers"), { recursive: true });

export const TEST_CONFIG = {
  banner: "",
  footer: "",
  Assistance_Channel: "100000000000000001",
  Transcript_Channel: "100000000000000002",
  Blacklist_Alert_Channel: "100000000000000003",
  Command_Log_Channel: "100000000000000004",
  General_support_role: "200000000000000001",
  Supervisor_support_role: "200000000000000002",
  General_category: "100000000000000005",
  Supervisor_category: "100000000000000006",
  Panel_min_role: "200000000000000003",
  Force_unclaim_role: "200000000000000004",
  Blacklist_Alert_Role: "200000000000000005",
  Config_roles: [],
  permissions: {
    max_open_tickets: 3,
    inactivity_checkup_hours: 24,
    inactivity_close_hours: 48,
    anti_ping_window_hours: 24,
    close_delay_seconds: 3,
  },
};
fs.writeFileSync(path.join(tmp, "config.json"), JSON.stringify(TEST_CONFIG));

Object.assign(process.env, {
  CONFIG_PATH: path.join(tmp, "config.json"),
  DOTENV_CONFIG_PATH: path.join(tmp, "no.env"),
  SARP_TICKETS_BOT_TOKEN: "test-token",
  SARP_TICKETS_CLIENT_ID: "test-client",
  BLOXLINK_API_KEY: "",
});
process.chdir(tmp);
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
