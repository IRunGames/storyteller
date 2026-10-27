/**
 * Whether the browser can load the address as a picture. A linked profile
 * picture is checked this way rather than by its extension or by fetching it
 * on the server: plenty of picture hosts serve images from addresses with no
 * extension, and the browser is what will have to show it, so it is the one
 * to ask. Gives up after the timeout so a host that never answers does not
 * leave the popover waiting.
 *
 * A module of its own so a test can replace it; jsdom never loads an image.
 */
export function loadsAsImage(url: string, timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => finish(false), timeoutMs);
    function finish(ok: boolean) {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    }
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}
