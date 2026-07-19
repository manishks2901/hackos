/**
 * Cross-tenant leak test (the worst-case RAG bug).
 * Creates two events with distinct secret docs, then asserts:
 *   1. Event A's assistant NEVER surfaces event B's secret.
 *   2. A non-member gets 403 on ask/search.
 * Run: node scripts/test-tenant-isolation.mjs   (API + AI + workers must be up)
 */
const API = process.env.API_URL ?? "http://localhost:4010";
const AI = process.env.AI_URL ?? "http://localhost:4011";
const run = Date.now().toString(36);

async function json(base, path, opts = {}, token) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function makeOrganizer(name, secret) {
  const { data: acct } = await json(API, "/v1/auth/signup", {
    method: "POST",
    body: { email: `${name}-${run}@test.dev`, password: "password123", name },
  });
  const { data: hack } = await json(
    API,
    "/v1/hackathons",
    { method: "POST", body: { name: `${name}-event-${run}` } },
    acct.accessToken,
  );
  await json(
    API,
    `/v1/hackathons/${hack.id}/resources`,
    {
      method: "POST",
      body: {
        type: "doc",
        title: `${name} logistics`,
        content: `# Logistics\n\nThe registration desk checkpoint phrase for this event is ${secret}. Say it at the desk to collect your badge.`,
      },
    },
    acct.accessToken,
  );
  return { token: acct.accessToken, hackathonId: hack.id };
}

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

const a = await makeOrganizer("alpha", "ZEBRA-771");
const b = await makeOrganizer("beta", "FALCON-224");

console.log("waiting for ingestion…");
await new Promise((r) => setTimeout(r, 20_000));

// 1. Ask event A's assistant for the secret — must answer from A's corpus only.
const askA = await json(
  AI,
  "/v1/ask",
  { method: "POST", body: { hackathonId: a.hackathonId, question: "What is the checkpoint phrase for registration?" } },
  a.token,
);
check(askA.data.answer?.includes("ZEBRA-771"), "event A retrieves its own content");
check(!JSON.stringify(askA.data).includes("FALCON-224"), "event A answer contains no event B content");

// 2. Semantic search in A must not surface B's chunks.
const searchA = await json(
  AI,
  "/v1/search",
  { method: "POST", body: { hackathonId: a.hackathonId, question: "checkpoint phrase registration" } },
  a.token,
);
check(!JSON.stringify(searchA.data).includes("FALCON-224"), "event A search contains no event B chunks");

// 3. A's organizer is not a member of B: both AI endpoints must 403.
const cross = await json(
  AI,
  "/v1/ask",
  { method: "POST", body: { hackathonId: b.hackathonId, question: "What is the checkpoint phrase?" } },
  a.token,
);
check(cross.status === 403, "non-member ask on event B returns 403");

const crossSearch = await json(
  AI,
  "/v1/search",
  { method: "POST", body: { hackathonId: b.hackathonId, question: "secret" } },
  a.token,
);
check(crossSearch.status === 403, "non-member search on event B returns 403");

// 4. API content endpoints are membership-gated too.
const crossApi = await json(API, `/v1/hackathons/${b.hackathonId}/resources`, {}, a.token);
check(crossApi.status === 403, "non-member resource list on event B returns 403");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
