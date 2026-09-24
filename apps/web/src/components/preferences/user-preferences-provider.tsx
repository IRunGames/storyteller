"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { JsonValue, UserPreferenceMap } from "@/lib/user-preference-schemas";
import { sa_setUserPreference, type SetUserPreferenceResult } from "./actions";

export type UserPreferences = {
  /** Reads one preference, or the fallback when the user never set it. */
  get<T extends JsonValue = JsonValue>(key: string, fallback: T): T;
  get<T extends JsonValue = JsonValue>(key: string): T | undefined;
  /**
   * Stores one preference. The new value shows at once and is sent to the
   * server behind it; if the server refuses or cannot be reached, the old
   * value comes back and the result says why.
   */
  set(key: string, value: JsonValue): Promise<SetUserPreferenceResult>;
};

const UserPreferencesContext = createContext<UserPreferences | null>(null);

/**
 * Holds the signed-in user's preference map for every client component under
 * (app)/layout.tsx, which loads it once per request with
 * sa_getUserPreferences() and mounts this just inside UserProvider. Client
 * components call useUserPreferences() instead of fetching the map again or
 * keeping their own copy in localStorage.
 *
 * Server components cannot read React context; they call
 * sa_getUserPreferences() themselves.
 */
export function UserPreferencesProvider({
  preferences,
  children,
}: {
  preferences: UserPreferenceMap;
  children: React.ReactNode;
}) {
  const [map, setMap] = useState(preferences);

  // Rebuilt only when the map changes, so a consumer that reads nothing that
  // moved is not re-rendered by a parent's render.
  const value = useMemo<UserPreferences>(() => {
    const get = (key: string, fallback?: JsonValue) =>
      Object.hasOwn(map, key) ? map[key] : fallback;

    const set = async (key: string, next: JsonValue) => {
      // Remembered before the optimistic write so a refusal can undo exactly
      // this change. A key that was never set is removed again rather than
      // left as undefined, which is not a JSON value.
      const hadKey = Object.hasOwn(map, key);
      const previous = map[key];
      setMap((current) => ({ ...current, [key]: next }));

      let result: SetUserPreferenceResult;
      try {
        result = await sa_setUserPreference({ key, value: next });
      } catch {
        // A thrown action means the request never landed (offline, signed
        // out mid-session). Report it like a refusal so callers handle one
        // shape, keyed by "root" as forms do for an unattributable error.
        result = { ok: false, errors: { root: "The preference could not be saved." } };
      }

      if (!result.ok) {
        setMap((current) => {
          const reverted = { ...current };
          if (hadKey) reverted[key] = previous;
          else delete reverted[key];
          return reverted;
        });
      }
      return result;
    };

    return { get: get as UserPreferences["get"], set };
  }, [map]);

  return (
    <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferences {
  const preferences = useContext(UserPreferencesContext);
  if (!preferences) {
    throw new Error(
      "useUserPreferences() can only be called inside a logged-in page: nothing above this component mounted UserPreferencesProvider.",
    );
  }
  return preferences;
}
