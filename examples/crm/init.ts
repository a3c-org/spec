import { defaultDataDir, initializeState } from "./runtime/state.ts";
try {
  const directory = process.env.CRM_DATA_DIR ?? defaultDataDir;
  await initializeState(directory);
  console.log(JSON.stringify({ initialized: directory }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Initialization failed");
  process.exitCode = 1;
}
