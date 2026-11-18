import { Container, Heading, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { STORE_PRODUCTS } from "@/lib/store-products";
import { StoreCatalog } from "./store-catalog";

// The Store, behind the "Store" nav item: image packs and ready-made
// adventures, searched and shown as cards or a list (StoreCatalog). A
// placeholder until the store opens: the products are made up
// (lib/store-products.ts) and nothing can be bought, which the page says.
// requireSession() here rather than trusting the group layout; see
// lib/require-session.ts.
export default async function StorePage() {
  await requireSession();

  return (
    <Container maxW="full" py="8">
      <Stack gap="10">
        <Stack gap="2">
          <Heading size="3xl">Store</Heading>
          <Text textStyle="lg" color="fg.muted">
            Image packs for your scenes and covers, and ready-made adventures for the games you run.
            The store is not open yet, so nothing here can be bought.
          </Text>
        </Stack>

        <StoreCatalog products={STORE_PRODUCTS} />
      </Stack>
    </Container>
  );
}
