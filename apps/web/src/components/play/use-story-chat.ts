"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/auth/user-provider";
import { toaster } from "@/components/ui/toaster";
import { mergeChatEntries, toChatEntry, type ChatEntry } from "@/lib/chat";
import type { ChatEvent, PublicChat } from "@/lib/realtime/chat-events";
import type { ChatPage } from "@/db/chats";
import { sa_listChats } from "@/app/(app)/play/[id]/actions";

/** The table chat as a table holds it; what the chat panel draws and the Chat toggle counts. */
export type StoryChat = {
  /** Every line held, in the order said. */
  entries: ChatEntry[];
  /** Whether there are lines said before the oldest one held. */
  hasPrevious: boolean;
  loadingPrevious: boolean;
  /** Loads the page of lines before the oldest one held. */
  loadPrevious: () => Promise<void>;
  /** A message off the chat topic. */
  receive: (event: ChatEvent) => void;
  /** Loads the latest lines again, as on every connection. */
  refresh: () => Promise<void>;
  /** A line as an action answered with it: said, or edited. */
  merge: (chat: PublicChat) => void;
  /** Lines said by others since the panel was last open. */
  unread: number;
};

/**
 * The story's table chat, held by the table rather than by the panel, so it
 * keeps listening while the panel is closed and can count what came in
 * meanwhile. It loads the latest lines on mount and again whenever the
 * caller says it has (re)connected, since a line may have gone by while it
 * was not listening; every load and every message is merged by line, so a
 * line seen twice is held once, an edit replaces what was held, and lines
 * of a scene the table has since left stay above their divider until the
 * page is reloaded.
 *
 * `isOpen` is whether the panel is showing: while it is not, each new line
 * said by someone else counts toward `unread`, which goes back to nothing
 * as the panel opens.
 */
export function useStoryChat(idStory: number, isOpen: boolean): StoryChat {
  const user = useUser();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [unread, setUnread] = useState(0);
  // Every line held, by id, kept as each merge happens rather than after the
  // render it causes, so two copies of one line arriving together are known
  // for one line and counted once.
  const known = useRef(new Set<number>());

  // A new story under the same table starts its chat afresh. Set during
  // render, the way React asks for state that follows a prop, as
  // usePlayScene does for the scene.
  const [seenStory, setSeenStory] = useState(idStory);
  if (seenStory !== idStory) {
    setSeenStory(idStory);
    setEntries([]);
    setHasPrevious(false);
    setUnread(0);
  }
  // Opening the panel reads what came in, the same way.
  if (isOpen && unread !== 0) setUnread(0);

  // What the message handler reads, which the channel holds across renders.
  // Kept current in an effect, as the hooks rule asks; a message always
  // arrives after the render that changed them.
  const entriesRef = useRef(entries);
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    entriesRef.current = entries;
    isOpenRef.current = isOpen;
  });
  // Whether the first page has said if there are older lines.
  const loaded = useRef(false);

  const mergeAll = useCallback((chats: PublicChat[]) => {
    for (const chat of chats) known.current.add(chat.idChat);
    setEntries((current) => mergeChatEntries(current, chats.map(toChatEntry)));
  }, []);

  // The latest page merged in; only the first page says whether there are
  // older lines, since a later load of the latest page says nothing about
  // lines before those already held.
  const takeLatest = useCallback(
    (page: ChatPage) => {
      mergeAll(page.chats);
      if (!loaded.current) {
        loaded.current = true;
        setHasPrevious(page.hasPrevious);
      }
    },
    [mergeAll],
  );

  const refresh = useCallback(async () => {
    try {
      takeLatest(await sa_listChats(idStory));
    } catch {
      // The next connection loads again; a chat that is a moment behind is
      // not worth interrupting the table for.
    }
  }, [idStory, takeLatest]);

  // A new story's chat starts with nothing known (its held lines were
  // dropped during render above) and loads its first page afresh. An answer
  // for a story the table has since left is dropped.
  useEffect(() => {
    known.current = new Set();
    loaded.current = false;
    let cancelled = false;
    sa_listChats(idStory)
      .then((page) => {
        if (!cancelled) takeLatest(page);
      })
      .catch(() => {
        // The first connection loads again.
      });
    return () => {
      cancelled = true;
    };
  }, [idStory, takeLatest]);

  const receive = useCallback(
    (event: ChatEvent) => {
      if (event.idStory !== idStory) return;
      const isNew = event.type === "chat.posted" && !known.current.has(event.chat.idChat);
      if (isNew && !isOpenRef.current && event.chat.idUser !== user.id) {
        setUnread((count) => count + 1);
      }
      mergeAll([event.chat]);
    },
    [idStory, mergeAll, user.id],
  );

  const merge = useCallback((chat: PublicChat) => mergeAll([chat]), [mergeAll]);

  const loadPrevious = useCallback(async () => {
    const oldest = entriesRef.current.find((entry) => entry.idChat !== null);
    if (!oldest?.idChat) return;
    setLoadingPrevious(true);
    try {
      const page = await sa_listChats(idStory, oldest.idChat);
      mergeAll(page.chats);
      setHasPrevious(page.hasPrevious);
    } catch {
      toaster.create({ title: "Earlier lines could not be loaded. Try again.", type: "error" });
    } finally {
      setLoadingPrevious(false);
    }
  }, [idStory, mergeAll]);

  return { entries, hasPrevious, loadingPrevious, loadPrevious, receive, refresh, merge, unread };
}
