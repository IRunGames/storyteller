"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Stops the reader leaving a page without being asked, while `armed` is
 * true. The App Router has no navigation event to cancel, so the two ways
 * out are caught where they start:
 *
 * A click on a link anywhere on the page is caught on the document in the
 * capture phase, before React's own listener at the root (and so before
 * next/link) sees it, and handed to onLeave with where it was going; the
 * caller asks, and navigates itself if the answer is yes. A click that
 * would not leave this tab (a modifier key, a new tab, a download, a link
 * to this very page) is let through.
 *
 * Closing the tab, reloading or typing an address is caught with
 * beforeunload, which only lets a page ask the browser to show its own
 * "Leave site?" prompt; no page may put its own words or buttons there.
 *
 * Navigation started from code (router.push in a menu item) and the
 * browser's back button get past both. A page that must clean up after
 * them does so as it unmounts.
 */
export function useLeaveGuard(armed: RefObject<boolean>, onLeave: (to: URL) => void) {
  // The latest callback, so the listeners are added once and never stale.
  const leave = useRef(onLeave);
  useEffect(() => {
    leave.current = onLeave;
  });

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!armed.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;
      const to = new URL(link.href, window.location.href);
      if (to.href === window.location.href) return;

      event.preventDefault();
      event.stopPropagation();
      leave.current(to);
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!armed.current) return;
      event.preventDefault();
      // Older browsers only show the prompt when returnValue is set.
      event.returnValue = "";
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [armed]);
}
