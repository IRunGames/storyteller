import { after } from "next/server";
import { storyStateTopic } from "./topics";
import type { StoryEvent } from "./events";

// Publishing to EMQX from the server. The broker's REST API is used rather
// than an MQTT client: a server action runs in a function that may be gone a
// moment after it answers, and opening a broker connection for every change
// would cost more than the change itself. One HTTPS POST with the deployment's
// API key does the same job.

const EMQX_API_PORT = "8443";

type Config = { url: string; authorization: string };

let warned = false;

/**
 * Where to publish and how to sign the request, from the environment, or
 * null when EMQX is not configured. Read on each call rather than at import
 * so a test can set the variables. Missing configuration is said once per
 * process and otherwise ignored: the table works without the broker, the
 * players just do not hear about changes until they reload.
 */
function config(): Config | null {
  const address = process.env.MQTT_ADDRESS;
  const appId = process.env.MQTT_APP_ID;
  const appSecret = process.env.MQTT_APP_SECRET;
  if (!address || !appId || !appSecret) {
    if (!warned) {
      warned = true;
      console.warn("MQTT_ADDRESS, MQTT_APP_ID and MQTT_APP_SECRET are not all set; not publishing");
    }
    return null;
  }
  const port = process.env.MQTT_API_PORT || EMQX_API_PORT;
  return {
    url: `https://${address}:${port}/api/v5/publish`,
    authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
  };
}

/**
 * Publishes one event on the story's state topic and waits for the broker's
 * answer. Never throws: the database write it follows has already happened
 * and is what counts, so a broker that is down or refuses is logged and the
 * action still answers as if all were well. QoS 1, so a subscriber that is
 * connected hears it once at least; not retained, since a player who
 * arrives later loads the scene afresh rather than reading the last message.
 */
export async function publishStoryEvent(idStory: number, event: StoryEvent): Promise<void> {
  const target = config();
  if (!target) return;

  const topic = storyStateTopic(idStory);
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: target.authorization },
      body: JSON.stringify({ topic, payload: JSON.stringify(event), qos: 1, retain: false }),
    });
    if (!response.ok) {
      console.error(
        `EMQX refused a publish on ${topic}: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error(`EMQX could not be reached to publish on ${topic}`, error);
  }
}

/**
 * Runs a publish after the action's answer has gone out, so the storyteller's
 * table is not held up by the broker, and the platform keeps the function
 * alive until it is done (Next's after()). Outside a request, as in a test or
 * a script, after() throws, and the work simply runs now.
 */
export function publishLater(work: () => Promise<void>): void {
  try {
    after(work);
  } catch {
    void work();
  }
}
