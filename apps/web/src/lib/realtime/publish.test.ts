import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";

import { publishStoryEvent } from "./publish";
import type { StoryEvent } from "./events";

const event: StoryEvent = {
  v: 1,
  at: "2026-10-13T10:00:00.000Z",
  idStory: 7,
  type: "scene.changed",
  idStoryScene: 3,
};

describe("publishStoryEvent", () => {
  const env = { ...process.env };
  let fetchMock: ReturnType<typeof mock.fn<typeof fetch>>;
  let errors: ReturnType<typeof mock.method>;

  beforeEach(() => {
    process.env.MQTT_ADDRESS = "broker.example.test";
    process.env.MQTT_APP_ID = "app";
    process.env.MQTT_APP_SECRET = "secret";
    delete process.env.MQTT_API_PORT;
    fetchMock = mock.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    errors = mock.method(console, "error", () => {});
  });

  afterEach(() => {
    process.env = { ...env };
    mock.restoreAll();
  });

  it("POSTs the event to the deployment's publish endpoint with the API key", async () => {
    await publishStoryEvent(7, event);

    expect(fetchMock.mock.calls).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    expect(url).toBe("https://broker.example.test:8443/api/v5/publish");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("app:secret").toString("base64")}`,
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      topic: "story/7/state",
      payload: JSON.stringify(event),
      qos: 1,
      retain: false,
    });
  });

  it("publishes nothing when the broker is not configured", async () => {
    delete process.env.MQTT_APP_SECRET;
    await publishStoryEvent(7, event);
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it("logs a refusal and a dead broker rather than throwing", async () => {
    fetchMock.mock.mockImplementationOnce(async () => new Response("", { status: 401 }));
    await publishStoryEvent(7, event);
    expect(errors.mock.calls).toHaveLength(1);

    fetchMock.mock.mockImplementationOnce(async () => {
      throw new Error("ECONNREFUSED");
    });
    await publishStoryEvent(7, event);
    expect(errors.mock.calls).toHaveLength(2);
  });
});
