import { after, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

// The Resend SDK posts with fetch, so fetch is replaced here: nothing in this
// file can reach the network, and each test reads the message it would have
// sent off the request body.
const fetch = mock.fn(
  async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ id: "e1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
);
const sent = () => JSON.parse(String(fetch.mock.calls[0].arguments[1]?.body));

let sendEmail: typeof import("./email").sendEmail;
const saved = {
  fetch: globalThis.fetch,
  key: process.env.RESEND_API_KEY,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT,
  nonProductionTo: process.env.EMAIL_NON_PRODUCTION_TO,
};

const mail = {
  to: "ada@example.test",
  subject: "You're invited to Storyteller",
  html: "<p>Hi</p>",
  text: "Hi",
};

describe("sendEmail", () => {
  before(async () => {
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_NON_PRODUCTION_TO = "support@example.test";
    ({ sendEmail } = await import("./email"));
  });

  beforeEach(() => fetch.mock.resetCalls());

  after(() => {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [
      ["RESEND_API_KEY", saved.key],
      ["NEXT_PUBLIC_ENVIRONMENT", saved.environment],
      ["EMAIL_NON_PRODUCTION_TO", saved.nonProductionTo],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sends to the address given in production", async () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT = "PRODUCTION";
    expect(await sendEmail(mail)).toBe(true);
    expect(sent()).toMatchObject({
      to: "ada@example.test",
      subject: "You're invited to Storyteller",
    });
  });

  for (const environment of ["DEV", "TEST", "STAGING", undefined]) {
    it(`sends to EMAIL_NON_PRODUCTION_TO instead in ${environment ?? "an unset environment"}`, async () => {
      if (environment === undefined) delete process.env.NEXT_PUBLIC_ENVIRONMENT;
      else process.env.NEXT_PUBLIC_ENVIRONMENT = environment;
      expect(await sendEmail(mail)).toBe(true);
      expect(sent()).toMatchObject({
        to: "support@example.test",
        subject: "[to: ada@example.test] You're invited to Storyteller",
        text: "Hi",
      });
    });
  }

  it("sends nothing outside production when EMAIL_NON_PRODUCTION_TO is not set", async () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT = "DEV";
    delete process.env.EMAIL_NON_PRODUCTION_TO;
    try {
      expect(await sendEmail(mail)).toBe(false);
      expect(fetch.mock.callCount()).toBe(0);
    } finally {
      process.env.EMAIL_NON_PRODUCTION_TO = "support@example.test";
    }
  });

  it("reports a refusal from Resend as not sent", async () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT = "PRODUCTION";
    fetch.mock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({ name: "validation_error", message: "domain is not verified" }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );
    expect(await sendEmail(mail)).toBe(false);
  });
});
