import { describe, it } from "node:test";
import { expect } from "expect";

import { appIconSet, appIcons } from "./app-icons";

describe("appIcons", () => {
  it("gives production the Storyteller mark and every other environment the dev d20", () => {
    expect(appIconSet("PRODUCTION")).toBe("production");
    expect(appIconSet("STAGING")).toBe("dev");
    expect(appIconSet("TEST")).toBe("dev");
    expect(appIconSet("DEV")).toBe("dev");
  });

  it("gives an environment the build does not know production's, never the dev set", () => {
    expect(appIconSet(null)).toBe("production");
  });

  it("names the three files of the set under public/icons", () => {
    expect(appIcons("DEV")).toEqual({
      icon: [
        { url: "/icons/dev/favicon.ico", sizes: "48x48", type: "image/x-icon" },
        { url: "/icons/dev/icon.png", type: "image/png" },
      ],
      apple: "/icons/dev/apple-icon.png",
    });
    expect(appIcons("PRODUCTION")).toMatchObject({ apple: "/icons/production/apple-icon.png" });
  });
});
