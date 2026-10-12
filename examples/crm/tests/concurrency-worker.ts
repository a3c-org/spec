import { openBaseline } from "../runtime/baseline.ts";
import { identities } from "../runtime/fixtures.ts";
const assembly = openBaseline(process.argv[2]!);
try {
  const contacts = assembly.ports(identities["alpha-rw"]).contacts;
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await contacts.create("Concurrent", "worker-retry"));
  console.log(JSON.stringify(results));
} finally { assembly.close(); }
