import { afterEach, beforeEach, describe, it } from "node:test";
import { expect } from "expect";
import { MissingEnvError, serverEnv } from "./env";

// Each test starts from an environment with none of the server's variables
// in it, sets what it needs, and gets the real one back afterwards.
const saved = { ...process.env };
const NAMES = [
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_NON_PRODUCTION_TO",
  "MQTT_ADDRESS",
  "MQTT_API_PORT",
  "MQTT_WS_TLS_PORT",
  "MQTT_APP_ID",
  "MQTT_APP_SECRET",
  "MQTT_PLAYER_USERNAME",
  "MQTT_PLAYER_PASSWORD",
];

describe("serverEnv", () => {
  beforeEach(() => {
    for (const name of NAMES) delete process.env[name];
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("reads an unset optional variable as undefined rather than failing", () => {
    expect(serverEnv().RESEND_API_KEY).toBeUndefined();
    expect(serverEnv().CRON_SECRET).toBeUndefined();
    expect(serverEnv().GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("gives the broker's two ports their defaults when unset or empty", () => {
    expect(serverEnv()).toMatchObject({ MQTT_API_PORT: "8443", MQTT_WS_TLS_PORT: "8084" });
    process.env.MQTT_API_PORT = "";
    process.env.MQTT_WS_TLS_PORT = "";
    expect(serverEnv()).toMatchObject({ MQTT_API_PORT: "8443", MQTT_WS_TLS_PORT: "8084" });
    process.env.MQTT_API_PORT = "9443";
    process.env.MQTT_WS_TLS_PORT = "9084";
    expect(serverEnv()).toMatchObject({ MQTT_API_PORT: "9443", MQTT_WS_TLS_PORT: "9084" });
  });

  it("counts an empty value as unset where the code it replaced did", () => {
    process.env.RESEND_API_KEY = "";
    process.env.CRON_SECRET = "";
    process.env.MQTT_ADDRESS = "";
    process.env.EMAIL_NON_PRODUCTION_TO = "";
    expect(serverEnv()).toMatchObject({
      RESEND_API_KEY: undefined,
      CRON_SECRET: undefined,
      MQTT_ADDRESS: undefined,
      EMAIL_NON_PRODUCTION_TO: undefined,
    });
  });

  it("keeps an empty value as given where the code it replaced did", () => {
    process.env.EMAIL_FROM = "";
    process.env.BETTER_AUTH_URL = "";
    expect(serverEnv()).toMatchObject({ EMAIL_FROM: "", BETTER_AUTH_URL: "" });
  });

  it("returns the variables it knows, by name, and nothing else from the environment", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.MQTT_ADDRESS = "broker.example.test";
    process.env.SOMETHING_ELSE = "not ours";
    const env = serverEnv();
    expect(env).toMatchObject({ RESEND_API_KEY: "re_test", MQTT_ADDRESS: "broker.example.test" });
    expect(Object.keys(env)).not.toContain("SOMETHING_ELSE");
    expect(Object.keys(env)).not.toContain("PATH");
  });

  it("reads the environment afresh on each call, so a value set later is seen", () => {
    expect(serverEnv().CRON_SECRET).toBeUndefined();
    process.env.CRON_SECRET = "s3cret";
    expect(serverEnv().CRON_SECRET).toBe("s3cret");
  });
});

describe("MissingEnvError", () => {
  it("names the variable and where to set it", () => {
    const error = new MissingEnvError("CRON_SECRET");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MissingEnvError");
    expect(error.variable).toBe("CRON_SECRET");
    expect(error.message).toMatch(/^CRON_SECRET is not set\./);
    expect(error.message).toMatch(/\.env\.local/);
    expect(error.message).toMatch(/\.env\.example/);
  });

  it("never carries a value, even when the variable is set", () => {
    process.env.CRON_SECRET = "do-not-print";
    try {
      expect(new MissingEnvError("CRON_SECRET").message).not.toMatch(/do-not-print/);
    } finally {
      process.env = { ...saved };
    }
  });
});
