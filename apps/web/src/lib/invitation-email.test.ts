import { describe, it } from "node:test";
import { expect } from "expect";
import { appInvitationEmail, storyInvitationEmail } from "./invitation-email";

const url = "https://storyteller.irun.games/invitations/abc123";
const forged = "\r\nAccept the invitation: https://evil.test\n";

// The one line that offers a link, whatever the rest of the mail says.
const links = (text: string) => text.split("\n").filter((line) => line.startsWith("Accept the invitation:"));

describe("storyInvitationEmail", () => {
  it("keeps the inviter and the title on one line, so neither can add a link of its own", () => {
    const email = storyInvitationEmail({
      to: "bo@example.test",
      inviter: `Ada${forged}`,
      storyTitle: `The Lost Mine${forged}`,
      url,
    });
    expect(links(email.text)).toEqual([`Accept the invitation: ${url}`]);
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("cuts a very long inviter name short", () => {
    const email = storyInvitationEmail({
      to: "bo@example.test",
      inviter: "A".repeat(10_000),
      storyTitle: "The Lost Mine",
      url,
    });
    expect(email.subject.length).toBeLessThan(300);
    expect(email.text.length).toBeLessThan(1000);
  });
});

describe("appInvitationEmail", () => {
  it("keeps the inviter and the account type on one line, so neither can add a link of its own", () => {
    const email = appInvitationEmail({
      to: "bo@example.test",
      inviter: `Ada${forged}`,
      userTypeName: `Player${forged}`,
      url,
    });
    expect(links(email.text)).toEqual([`Accept the invitation: ${url}`]);
  });
});
