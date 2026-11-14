"use client";

import { useState, type ReactNode } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";

/** A style the server render inserted, by its Emotion name. */
type Inserted = { name: string; isGlobal: boolean };

/**
 * Puts the server render's Emotion styles, which are Chakra's, in <head>
 * rather than in <body> beside the elements they style.
 *
 * Left to itself, Emotion writes a <style> tag into the server HTML ahead of
 * a component's markup, inside <body>. On the client, @emotion/react moves
 * those tags into <head> when its module is first evaluated, and in the App
 * Router that happens during hydration, when React reaches the Provider.
 * React is then holding a tag that has left <body>, cannot find the element
 * after it, and throws the server HTML away with a hydration error; drawing
 * next-themes' script again on the client then adds a script tag warning.
 *
 * With `compat` set, Emotion keeps the server's styles in the cache rather
 * than writing them out. Each one is recorded as it is inserted, and Next
 * writes those recorded since the last flush into <head>, or ahead of a
 * streamed chunk, through useServerInsertedHTML. The client's cache finds
 * them there by their data-emotion names, so none is inserted twice.
 */
export function EmotionRegistry({ children }: { children: ReactNode }) {
  const [registry] = useState(() => {
    const cache = createCache({ key: "css" });
    cache.compat = true;
    const insert = cache.insert;
    let inserted: Inserted[] = [];
    cache.insert = (...args: Parameters<typeof insert>) => {
      const [selector, serialized] = args;
      // Only the server render flushes, so only it records.
      if (typeof window === "undefined" && cache.inserted[serialized.name] === undefined) {
        // A global style is inserted with no selector.
        inserted.push({ name: serialized.name, isGlobal: !selector });
      }
      return insert(...args);
    };
    const flush = () => {
      const flushed = inserted;
      inserted = [];
      return flushed;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const flushed = registry.flush();
    if (flushed.length === 0) return null;

    // Each global style keeps a tag of its own, named as Emotion's Global
    // looks for it on the client; the rest share one tag.
    const { key, inserted } = registry.cache;
    const globals: { name: string; css: string }[] = [];
    const names: string[] = [];
    let styles = "";
    for (const { name, isGlobal } of flushed) {
      const css = inserted[name];
      if (typeof css !== "string") continue;
      if (isGlobal) {
        globals.push({ name, css });
      } else {
        names.push(name);
        styles += css;
      }
    }

    return (
      <>
        {globals.map(({ name, css }) => (
          <style
            key={name}
            data-emotion={`${key}-global ${name}`}
            dangerouslySetInnerHTML={{ __html: css }}
          />
        ))}
        {styles !== "" && (
          <style
            data-emotion={`${key} ${names.join(" ")}`}
            dangerouslySetInnerHTML={{ __html: styles }}
          />
        )}
      </>
    );
  });

  return <CacheProvider value={registry.cache}>{children}</CacheProvider>;
}
