// The module mocks and fixtures the component tests share. Each must be
// called inside `before`, ahead of the dynamic import of the component under
// test: `mock.module` only takes effect for modules loaded after it
// (docs/standards.md, Testing).
import { mock, type Mock } from "node:test";
import type { CurrentUser } from "@/lib/current-user";

/** The router a component gets from next/navigation's useRouter, every method a mock. */
export type MockRouter = {
  push: ReturnType<typeof mock.fn<(href: string) => void>>;
  replace: ReturnType<typeof mock.fn<(href: string) => void>>;
  refresh: ReturnType<typeof mock.fn<() => void>>;
  back: ReturnType<typeof mock.fn<() => void>>;
};

export function mockRouter(): MockRouter {
  return {
    push: mock.fn<(href: string) => void>(),
    replace: mock.fn<(href: string) => void>(),
    refresh: mock.fn<() => void>(),
    back: mock.fn<() => void>(),
  };
}

/**
 * Replaces next/navigation for a client component: `useRouter` hands out the
 * router given (or a fresh one), `usePathname` the path given. The router
 * comes back so a test can read what was pushed; a test that changes the
 * path between renders passes a getter.
 */
export function mockNavigation(
  options: { router?: MockRouter; pathname?: string | (() => string) } = {},
): MockRouter {
  const router = options.router ?? mockRouter();
  const pathname = options.pathname ?? "/";
  mock.module("next/navigation", {
    namedExports: {
      useRouter: () => router,
      usePathname: () => (typeof pathname === "function" ? pathname() : pathname),
    },
  });
  return router;
}

// `never[]` parameters so a test's own mock, typed with the action's real
// input, is accepted in place of the default.
type HeaderMock = Mock<(...args: never[]) => Promise<unknown>>;
type HeaderMocks = {
  signOut: HeaderMock;
  sa_submitFeedback: HeaderMock;
  sa_setUserPreference: HeaderMock;
};

/**
 * What a page that mounts the AppHeader has to replace besides navigation:
 * the sign-out client call, the feedback popover's action and the
 * preferences action every `useUserPreferences().set` reaches. A test that
 * asserts on one passes its own mock for it; the rest answer ok. The mocks
 * come back so a test can reset them.
 */
export function mockHeader(own: Partial<HeaderMocks> = {}): HeaderMocks {
  const mocks: HeaderMocks = {
    signOut: own.signOut ?? mock.fn(async () => ({})),
    sa_submitFeedback: own.sa_submitFeedback ?? mock.fn(async () => ({ ok: true as const })),
    sa_setUserPreference: own.sa_setUserPreference ?? mock.fn(async () => ({ ok: true as const })),
  };
  mock.module("@/lib/auth-client", { namedExports: { signOut: mocks.signOut } });
  mock.module("@/components/feedback/actions", {
    namedExports: { sa_submitFeedback: mocks.sa_submitFeedback },
  });
  mock.module("@/components/preferences/actions", {
    namedExports: { sa_setUserPreference: mocks.sa_setUserPreference },
  });
  return mocks;
}

/**
 * The signed-in user a component test mounts in UserProvider. A plain
 * storyteller under a fixture address; a test that needs a guest, a player
 * or a name of its own passes the fields to change.
 */
export function currentUser(over: Partial<CurrentUser> = {}): CurrentUser {
  return {
    // In the seeds' synthetic range (db/seeds/seed_s_users.sql), never a
    // real person's id, and past any id the seeds use.
    id: "00000000-0000-7000-8000-0000000fab1e",
    name: "Fixture Storyteller",
    email: "fixture-storyteller@example.test",
    image: null,
    nickName: null,
    idUserType: -10,
    isAnonymous: false,
    ...over,
  };
}
