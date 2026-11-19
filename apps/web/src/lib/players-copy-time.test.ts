// The players' copy is rendered in after() of the action that saved the
// drawing, which runs in the function serving the page the annotator was
// opened on; the platform stops that function at the page's maxDuration. A
// render loop that may run CATCH_UP_MS, under a claim that holds for
// RENDER_CLAIM_SECONDS, needs a page that lets it.
import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";

import { CATCH_UP_MS, RENDER_CLAIM_SECONDS } from "./annotations";

// Every page that shows a picture's annotation controls: the run and live
// pages, the story's Attachments (its page and the prep board), an element's
// pictures, and a scene's preview.
const PAGES = [
  "src/app/(app)/stories/[id]/run/page.tsx",
  "src/app/(app)/stories/[id]/scenes/[idScene]/page.tsx",
  "src/app/(app)/(nav)/stories/[id]/page.tsx",
  "src/app/(app)/(nav)/stories/[id]/library/page.tsx",
  "src/app/(app)/(nav)/elements/[id]/edit/page.tsx",
  "src/app/(app)/stories/[id]/scenes/[idScene]/preview/page.tsx",
];

describe("the players' copy's time", () => {
  it("is caught up within the claim, so a render at work is never taken for gone", () => {
    expect(CATCH_UP_MS / 1000).toBeLessThan(RENDER_CLAIM_SECONDS);
  });

  it("is given by every page the annotator saves from", () => {
    for (const page of PAGES) {
      const declared = readFileSync(page, "utf8").match(/^export const maxDuration = (\d+);$/m);
      expect({ page, seconds: Number(declared?.[1] ?? 0) >= RENDER_CLAIM_SECONDS }).toEqual({
        page,
        seconds: true,
      });
    }
  });
});
