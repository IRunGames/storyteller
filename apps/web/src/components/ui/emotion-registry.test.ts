import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect } from "expect";

type Rendered = { html: string; inserted: string };

// The server render runs in a process of its own, without the test setup's
// jsdom; src/test/emotion-server-render.tsx says why.
function serverRender(): { bare: Rendered; registered: Rendered } {
  const script = join(process.cwd(), "src/test/emotion-server-render.tsx");
  const out = execFileSync(process.execPath, ["--import", "tsx", script], { encoding: "utf8" });
  return JSON.parse(out);
}

describe("EmotionRegistry", () => {
  it("gives the server's styles to Next for <head> rather than writing them into the page", () => {
    const { bare, registered } = serverRender();

    // Without it, Emotion writes its tags inline, where moving them into
    // <head> on the client breaks hydration.
    expect(bare.html).toContain('<style data-emotion="css-global');
    expect(bare.html).toContain('<style data-emotion="css ');

    expect(registered.html).not.toContain("<style");
    expect(registered.html).toContain("Story");
    // Each global style under the name Emotion's Global looks for on the
    // client, the rest in one tag; together the same rules as inline.
    expect(registered.inserted).toMatch(/<style data-emotion="css-global [a-z0-9]+">/);
    expect(registered.inserted).toMatch(/<style data-emotion="css( [a-z0-9]+)+">/);
    const boxClass = registered.html.match(/class="(css-[a-z0-9]+)"/)?.[1];
    expect(boxClass).toBeDefined();
    expect(registered.inserted).toContain(`.${boxClass}{`);
  });
});
