// Renders Chakra on the server, once bare and once inside EmotionRegistry,
// and prints as JSON what each HTML holds and what useServerInsertedHTML was
// handed. emotion-registry.test.ts runs it in a process of its own: Emotion
// decides at import whether it is on a server by looking for `document`,
// which setup.ts defines for every test file.
import { Fragment, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { ServerInsertedHTMLContext } from "next/dist/shared/lib/server-inserted-html.shared-runtime";
import { Box, ChakraProvider } from "@chakra-ui/react";
import { system } from "@/theme";
import { EmotionRegistry } from "@/components/ui/emotion-registry";

function render(tree: ReactNode) {
  const callbacks: (() => ReactNode)[] = [];
  const html = renderToString(
    <ServerInsertedHTMLContext.Provider value={(callback) => callbacks.push(callback)}>
      {tree}
    </ServerInsertedHTMLContext.Provider>,
  );
  // Next calls the callbacks after each flush; one render is one flush.
  const inserted = renderToString(
    <>
      {callbacks.map((callback, i) => (
        <Fragment key={i}>{callback()}</Fragment>
      ))}
    </>,
  );
  return { html, inserted };
}

const page = (
  <ChakraProvider value={system}>
    <Box padding="4">Story</Box>
  </ChakraProvider>
);

console.log(
  JSON.stringify({
    bare: render(page),
    registered: render(<EmotionRegistry>{page}</EmotionRegistry>),
  }),
);
