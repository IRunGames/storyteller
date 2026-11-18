import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAccount, UnauthorizedError } from "@/lib/authorize";
import { ALLOWED_IMAGE_TYPES, maxUploadBytes, uploadPrefix } from "@/lib/image-uploads";

/**
 * A refusal the route composed itself, so its message may be shown to the
 * user as it is. Every other error is logged and answered with a fixed line:
 * a driver's or the SDK's message could name internals.
 */
class UploadRefused extends Error {}

const REFUSED = "Upload could not be authorised.";

/**
 * Issues the short-lived token the browser uses to upload straight to Vercel
 * Blob.
 *
 * This is the one write path in the app that is a route handler rather than a
 * server action, and it is deliberate: `upload()` from `@vercel/blob/client`
 * needs an HTTP endpoint it can POST to for a token, and a server action
 * cannot serve that role. The authorisation is not weaker for it — the same
 * `requireAccount()` the actions open with runs here before a token is issued.
 *
 * `onUploadCompleted` is not used. Vercel calls it from their own network, so
 * it never fires against localhost, and nothing needs it: the browser gets
 * the URL back from `upload()` directly.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Inside the try: a body that is not JSON is the caller's mistake, a 400,
    // not a crash of the route.
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await requireAccount();

        // The client chooses the pathname, so this is the only place the
        // prefix can be enforced. Without it a signed-in user could write
        // into someone else's prefix and make the delete check meaningless.
        if (!pathname.startsWith(uploadPrefix(user.id))) {
          throw new UploadRefused("That upload path does not belong to you.");
        }

        return {
          allowedContentTypes: [...ALLOWED_IMAGE_TYPES],
          // A profile picture is held to a smaller size than an attachment;
          // the pathname is already proven to be under this user's prefix.
          maximumSizeInBytes: maxUploadBytes(pathname, user.id),
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "You need to be signed in to do that." }, { status: 401 });
    }
    if (error instanceof UploadRefused) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Could not authorise an upload", error);
    return Response.json({ error: REFUSED }, { status: 400 });
  }
}
