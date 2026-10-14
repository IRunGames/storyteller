"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import { parseStoryEvent, storyEventTitle, type StoryEvent } from "@/lib/realtime/events";
import { sa_getStoryChannel } from "@/app/(app)/play/[id]/actions";

/** Where the connection to the broker stands. */
export type ChannelStatus =
  /** Asking the server how to reach the broker. */
  | "connecting"
  | "connected"
  /** The connection dropped and the client is trying again. */
  | "reconnecting"
  | "offline"
  /** The broker is not configured, or the caller may not listen: no live updates. */
  | "unavailable";

/** One message off the topic, as the diagnostics panel lists it. */
export type ChannelMessage = {
  id: number;
  at: Date;
  topic: string;
  /** What it is about, in a few words; the raw payload is behind it. */
  title: string;
  /** The payload as it came, decoded from JSON, or the text itself when it is not JSON. */
  payload: unknown;
  /** Whether the message was one of ours (parseStoryEvent took it). */
  known: boolean;
};

export type ChannelState = {
  status: ChannelStatus;
  url: string | null;
  topic: string | null;
  /** The last error the client raised, if any. */
  error: string | null;
  /** Newest first. */
  messages: ChannelMessage[];
  clear: () => void;
};

/** How many messages the panel keeps; a long session would otherwise grow without end. */
const KEPT_MESSAGES = 200;

const decoder = new TextDecoder();

/**
 * One MQTT connection to the story's state topic for as long as the
 * component is mounted. The server says how to reach the broker
 * (sa_getStoryChannel), and nothing is connected when it says not to.
 * Every message is parsed and handed to `onEvent`; `onConnect` fires on
 * each connection, the first included, so the caller can load what it may
 * have missed. Both are read through refs, so a caller that passes a new
 * function on every render does not reconnect. With `enabled` false nothing
 * connects and the channel reads as unavailable: the storyteller's table
 * only listens for its diagnostics panel, and only for someone who gets one.
 */
export function useStoryChannel(
  idStory: number,
  onEvent: (event: StoryEvent) => void,
  onConnect: () => void,
  enabled = true,
): ChannelState {
  const [status, setStatus] = useState<ChannelStatus>("connecting");
  const [url, setUrl] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const onEventRef = useRef(onEvent);
  const onConnectRef = useRef(onConnect);
  // Kept current in an effect rather than during render, as the hooks rule
  // asks; a message always arrives after the render that changed them.
  useEffect(() => {
    onEventRef.current = onEvent;
    onConnectRef.current = onConnect;
  });
  const nextId = useRef(1);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let client: mqtt.MqttClient | null = null;

    void (async () => {
      const channel = await sa_getStoryChannel(idStory);
      if (cancelled) return;
      if (!channel) {
        setStatus("unavailable");
        return;
      }
      setUrl(channel.url);
      setTopic(channel.topic);

      // clean: true, since a player who comes back loads the scene afresh
      // rather than reading what queued for them while they were away.
      client = mqtt.connect(channel.url, {
        username: channel.username,
        password: channel.password,
        clean: true,
        reconnectPeriod: 2_000,
        connectTimeout: 10_000,
      });
      client.on("connect", () => {
        setStatus("connected");
        setError(null);
        client?.subscribe(channel.topic, { qos: 1 }, (err) => {
          if (err) setError(`Could not subscribe: ${err.message}`);
        });
        onConnectRef.current();
      });
      client.on("reconnect", () => setStatus("reconnecting"));
      client.on("offline", () => setStatus("offline"));
      client.on("close", () => setStatus((s) => (s === "connected" ? "offline" : s)));
      client.on("error", (err) => setError(err.message));
      client.on("message", (incoming, payload) => {
        const text = decoder.decode(payload);
        let parsed: unknown = text;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Not JSON: the panel shows the text as it came.
        }
        const event = parseStoryEvent(parsed);
        setMessages((current) =>
          [
            {
              id: nextId.current++,
              at: new Date(),
              topic: incoming,
              title: event ? storyEventTitle(event) : "unrecognised message",
              payload: parsed,
              known: event !== null,
            },
            ...current,
          ].slice(0, KEPT_MESSAGES),
        );
        if (event) onEventRef.current(event);
      });
    })();

    return () => {
      cancelled = true;
      // force: true, so a client still connecting is dropped rather than
      // left to finish and then linger.
      client?.end(true);
    };
  }, [idStory, enabled]);

  const clear = useCallback(() => setMessages([]), []);

  return { status: enabled ? status : "unavailable", url, topic, error, messages, clear };
}
