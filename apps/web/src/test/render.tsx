import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";

import { Provider } from "@/components/ui/provider";

/**
 * Renders inside the same Chakra + next-themes providers the app mounts in
 * RootLayout. Chakra v3 components read their recipes off the provider's
 * system, so rendering one bare throws rather than degrading.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Provider, ...options });
}

export * from "@testing-library/react";
