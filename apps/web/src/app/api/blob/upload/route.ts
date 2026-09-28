import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser, UnauthorizedError } from "@/lib/authorize";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, uploadPrefix } from "@/lib/image-uploads";

/**
 * Issues the short-lived token the browser uses to upload straight to Vercel
 * Blob.
 *
 * This is the one write path in the app that is a route handler rather than a
 * server action, and it is deliberate: `upload()` from `@vercel/blob/client`
 * needs an HTTP endpoint it can POST to for a token, and a server action
 * cannot serve that role. The authorisation is not weaker for it — the same
 * `requireUser()` every action opens with runs here before a token is issued.
 *
 * `onUploadCompleted` is not used. Vercel calls it from their own network, so
 * it never fires against localhost, and nothing needs it: the browser gets
 * the URL back from `upload()` directly.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await requireUser();

        // The client chooses the pathname, so this is the only place the
        // prefix can be enforced. Without it a signed-in user could write
        // into someone else's prefix and make the delete check meaningless.
        if (!pathname.startsWith(uploadPrefix(user.id))) {
          throw new Error("That upload path does not belong to you.");
        }

        return {
          allowedContentTypes: [...ALLOWED_IMAGE_TYPES],
          maximumSizeInBytes: MAX_IMAGE_BYTES,
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
    const message = error instanceof Error ? error.message : "Upload could not be authorised.";
    return Response.json({ error: message }, { status: 400 });
  }
}
