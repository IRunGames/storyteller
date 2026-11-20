import type { Email } from "@/lib/email";
import { escapeHtml } from "@/lib/escape-html";
import { oneLine } from "@/lib/one-line";

// Plain HTML and text rather than React Email templates: two short messages
// do not earn a templating dependency yet. Every name and title in them was
// typed by someone, so each goes through oneLine before it is used.

function body(lines: string[], url: string, button: string): { html: string; text: string } {
  const html = `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a;">
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n")}
<p><a href="${escapeHtml(url)}" style="display: inline-block; padding: 10px 18px; border-radius: 8px; background: #1a1a1a; color: #ffffff; text-decoration: none;">${escapeHtml(button)}</a></p>
<p style="color: #666666; font-size: 13px;">Or open this link: ${escapeHtml(url)}</p>
</body></html>`;
  const text = [...lines, "", `${button}: ${url}`].join("\n");
  return { html, text };
}

/** "<inviter> invited you to play <story>", from a storyteller. */
export function storyInvitationEmail(input: {
  to: string;
  inviter: string;
  storyTitle: string;
  url: string;
}): Email {
  const inviter = oneLine(input.inviter);
  const storyTitle = oneLine(input.storyTitle);
  return {
    to: input.to,
    subject: `${inviter} invited you to play ${storyTitle}`,
    ...body(
      [
        `${inviter} has invited you to play ${storyTitle} on Storyteller.`,
        "Follow the link to take your seat. If you don't have an account yet, you can make one on the way.",
      ],
      input.url,
      "Accept the invitation",
    ),
  };
}

/** "You're invited to Storyteller", from an administrator, naming the account type. */
export function appInvitationEmail(input: {
  to: string;
  inviter: string;
  userTypeName: string;
  url: string;
}): Email {
  return {
    to: input.to,
    subject: "You're invited to Storyteller",
    ...body(
      [
        `${oneLine(input.inviter)} has invited you to Storyteller, with a ${oneLine(input.userTypeName)} account.`,
        "Follow the link to accept. If you don't have an account yet, you can make one on the way.",
      ],
      input.url,
      "Accept the invitation",
    ),
  };
}
