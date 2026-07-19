/**
 * Seeds a complete, realistic demo hackathon for pilots and demos.
 * Run: node scripts/seed-demo.mjs   (API + workers up)
 * Idempotent-ish: re-running creates a fresh event under the same organizer.
 */
const API = process.env.API_URL ?? "http://localhost:4010";
const EMAIL = "organizer@hackos.dev";
const PASSWORD = "hackos-demo-123";

async function json(path, opts = {}, token) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(data.error ?? `${path} -> ${res.status}`);
  return data;
}

// account (signup or signin)
let auth = await json("/v1/auth/signup", {
  method: "POST",
  body: { email: EMAIL, password: PASSWORD, name: "Demo Organizer" },
});
if (!auth.accessToken) {
  auth = await json("/v1/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
}
const token = auth.accessToken;

const now = Date.now();
const hack = await json(
  "/v1/hackathons",
  {
    method: "POST",
    body: {
      name: "HackOS Demo Day",
      description: "48-hour demo hackathon showcasing the HackOS platform.",
      venue: "Innovation Hall, Building 7",
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 48 * 3600e3).toISOString(),
    },
  },
  token,
);
console.log(`event: ${hack.name} (${hack.id})`);
console.log(`participant invite: ${hack.inviteCode}`);

const mentorInvite = await json(
  `/v1/hackathons/${hack.id}/invites`,
  { method: "POST", body: { role: "mentor" } },
  token,
);
console.log(`mentor invite:      ${mentorInvite.code}`);

const resources = [
  {
    type: "problem_statement",
    title: "Track 1: Developer Productivity",
    content:
      "# Track 1 — Developer Productivity\n\nBuild a tool that removes friction from a developer's day. Judged on real-world impact and polish.\n\n## Examples\n- IDE extensions\n- CLI tools\n- Workflow automation",
  },
  {
    type: "problem_statement",
    title: "Track 2: AI for Communities",
    content:
      "# Track 2 — AI for Communities\n\nUse AI to help communities coordinate, learn, or stay informed. Cited, grounded answers preferred over generic chatbots.",
  },
  {
    type: "submission_guidelines",
    title: "Rules & Submission",
    content:
      "# Rules\n\n## Eligibility\nTeams of 1–4. All core project code must be written during the event. Pre-built auth libraries, UI kits and infrastructure libraries are permitted.\n\n## Submission\nSubmissions close 48 hours after kickoff. Submit a repo URL and a 2-minute demo video from the HackOS extension. Late submissions are not accepted.\n\n## Judging\nImpact 40%, technical execution 30%, design 20%, presentation 10%.",
  },
  {
    type: "sponsor_api",
    title: "PayFlow Sponsor API",
    content:
      "# PayFlow API\n\nPayFlow sponsors the Best FinTech Hack prize ($2000).\n\n- Sandbox: https://sandbox.payflow.dev\n- Event key: PF-HACK-2026\n- Rate limit: 100 requests/minute\n- Payments endpoint: POST /v1/charges",
  },
  {
    type: "faq",
    title: "FAQ",
    content:
      "# FAQ\n\n## Can I use pre-built libraries?\nYes — auth, UI kits and infra libraries are fine. Core project logic must be written at the event.\n\n## Is there hardware support?\nYes, a limited number of dev boards at the mentor desk, first come first served.\n\n## Food?\nMeals every 6 hours in the atrium; dietary options available.",
  },
  {
    type: "link",
    title: "Event photos & media kit",
    url: "https://example.com/hackos-demo-media",
  },
];
for (const r of resources) {
  await json(`/v1/hackathons/${hack.id}/resources`, { method: "POST", body: r }, token);
}
console.log(`resources: ${resources.length} created (ingestion indexing in background)`);

const timeline = [
  { title: "Kickoff & team formation", startsAt: new Date(now + 1 * 3600e3).toISOString() },
  { title: "Workshop: shipping fast with AI", startsAt: new Date(now + 5 * 3600e3).toISOString() },
  { title: "Mentor office hours", startsAt: new Date(now + 24 * 3600e3).toISOString() },
  { title: "Submissions close", startsAt: new Date(now + 48 * 3600e3).toISOString() },
  { title: "Demos & judging", startsAt: new Date(now + 50 * 3600e3).toISOString() },
];
for (const t of timeline) {
  await json(`/v1/hackathons/${hack.id}/timeline`, { method: "POST", body: t }, token);
}
console.log(`timeline: ${timeline.length} items`);

await json(
  `/v1/hackathons/${hack.id}/announcements`,
  {
    method: "POST",
    body: {
      title: "Welcome to HackOS Demo Day!",
      body: "Docs, rules and sponsor APIs are in your sidebar. Ask the AI assistant anything about the event.",
      priority: "normal",
    },
  },
  token,
);
console.log("announcement: welcome posted");

console.log("\n--- demo credentials ---");
console.log(`organizer:  ${EMAIL} / ${PASSWORD}`);
console.log(`dashboard:  http://localhost:3000/dashboard`);
console.log(`extension:  Hackathon: Join with Invite Code -> ${hack.inviteCode}`);
