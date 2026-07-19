import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Load the monorepo root .env (apps/workers/src|dist -> repo root).
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
