import { before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import type { Email } from "@/lib/email";

const sendEmail = mock.fn(async (_email: Email) => true);
const sent = () => sendEmail.mock.calls[0].arguments[0];

let notifySupportOfSignup: typeof import("./signup-email").notifySupportOfSignup;

const ada = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  createdAt: new Date("2026-11-20T15:42:00Z"),
  isAnonymous: false,
};

describe("notifySupportOfSignup", () => {
  before(async () => {
    mock.module("@/lib/email", { namedExports: { sendEmail } });
    ({ notifySupportOfSignup } = await import("./signup-email"));
  });

  beforeEach(() => sendEmail.mock.resetCalls());

  it("mails support the new account's name, email and when it was made", async () => {
    await notifySupportOfSignup(ada);
    expect(sendEmail.mock.callCount()).toBe(1);
    expect(sent()).toMatchObject({
      to: "support@storyteller.irun.games",
      subject: "New sign-up: Ada Lovelace",
    });
    for (const part of [sent().text, sent().html]) {
      expect(part).toContain("Ada Lovelace");
      expect(part).toContain("ada@example.test");
      expect(part).toContain("Nov 20, 2026, 3:42 PM UTC");
    }
  });

  it("sends nothing for a guest, who has no account", async () => {
    await notifySupportOfSignup({ ...ada, isAnonymous: true });
    expect(sendEmail.mock.callCount()).toBe(0);
  });

  it("escapes the name in the HTML, since people type it", async () => {
    await notifySupportOfSignup({ ...ada, name: "<b>Ada</b>" });
    expect(sent().html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(sent().html).not.toContain("<b>Ada</b>");
  });

  it("keeps a name with line breaks on one line, so it cannot add rows of its own", async () => {
    await notifySupportOfSignup({ ...ada, name: "Ada\r\nEmail: someone@else.test\nSigned up: never" });
    const lines = sent().text.split("\n");
    expect(lines.filter((line) => line.startsWith("Email:"))).toEqual(["Email: ada@example.test"]);
    expect(lines.filter((line) => line.startsWith("Signed up:"))).toHaveLength(1);
    expect(sent().subject).not.toMatch(/[\r\n]/);
  });

  it("cuts a very long name short", async () => {
    await notifySupportOfSignup({ ...ada, name: "A".repeat(10_000) });
    expect(sent().subject.length).toBeLessThan(300);
    expect(sent().text.length).toBeLessThan(1000);
  });
});
