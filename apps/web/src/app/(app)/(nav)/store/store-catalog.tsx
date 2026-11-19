"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Grid,
  Heading,
  HStack,
  Input,
  InputGroup,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { BookOpen, Images, Search } from "lucide-react";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { STORE_VIEW_KEY } from "@/lib/preference-keys";
import { ViewToggle, type CardsOrList } from "@/components/buttons/view-toggle";
import { CoverBackdrop } from "@/components/covers/cover-backdrop";
import {
  STORE_KIND_LABELS,
  formatPrice,
  matchesStoreSearch,
  type StoreGenre,
  type StoreProduct,
} from "@/lib/store-products";

// Each genre's colour behind a card, which has no picture yet: deep enough
// that the white text reads on it as it does on a story's cover.
const GENRE_COLOURS: Record<StoreGenre, string> = {
  Fantasy: "green.800",
  "Sci-Fi": "blue.800",
  Horror: "red.900",
  Weird: "purple.800",
};

/**
 * The Store's products under a search box, as cards (Icon view) or a table
 * (List view) by the toggle in the upper right, as the Stories page shows
 * stories. The search narrows the list as it is typed: every word must be
 * somewhere in a product (matchesStoreSearch). Nothing is for sale yet, so
 * each product says Coming soon where its button will be.
 */
export function StoreCatalog({ products }: { products: readonly StoreProduct[] }) {
  const preferences = useUserPreferences();
  const view: CardsOrList = preferences.get(STORE_VIEW_KEY) === "list" ? "list" : "cards";
  const [search, setSearch] = useState("");
  const shown = products.filter((product) => matchesStoreSearch(product, search));

  return (
    <Stack as="section" aria-labelledby="store-products-heading" gap="4">
      <HStack justify="space-between" align="center" wrap="wrap" gap="4">
        <Heading id="store-products-heading" size="xl">
          Products
        </Heading>
        <HStack gap="3" wrap="wrap" ms="auto">
          <InputGroup startElement={<Search size={14} />} w={{ base: "full", sm: "64" }}>
            <Input
              type="search"
              size="sm"
              aria-label="Search the store"
              placeholder="Search the store"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
          <ViewToggle
            value={view}
            onChange={(next) => void preferences.set(STORE_VIEW_KEY, next)}
          />
        </HStack>
      </HStack>

      {shown.length === 0 ? (
        <Text color="fg.muted">Nothing in the store matches that search.</Text>
      ) : view === "list" ? (
        <StoreTable products={shown} />
      ) : (
        <Grid
          templateColumns={{
            base: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(auto-fill, minmax(16rem, 20rem))",
          }}
          gap="4"
        >
          {shown.map((product) => (
            <StoreCard key={product.id} product={product} />
          ))}
        </Grid>
      )}
    </Stack>
  );
}

/** What a product is, under its title: the system an adventure is for, and what is in it. */
function detailLine(product: StoreProduct): string {
  return product.system ? `${product.system} · ${product.contents}` : product.contents;
}

/**
 * One product as a card, drawn as a story card is: the genre's colour where
 * the cover will be, the cards' scrim, the kind and genre at the top, the
 * title and what is in it, a few lines of description, and the price.
 */
function StoreCard({ product }: { product: StoreProduct }) {
  const Icon = product.kind === "ADVENTURE" ? BookOpen : Images;
  return (
    <Box
      as="article"
      aria-label={product.title}
      position="relative"
      overflow="hidden"
      rounded="xl"
      aspectRatio={{ base: 5 / 3, md: 4 / 3 }}
      color="white"
      _hover={{ boxShadow: "lg" }}
      transition="box-shadow 0.15s"
    >
      <CoverBackdrop url={null} scrim="deep-gradient" fallback={GENRE_COLOURS[product.genre]} />
      <Stack position="relative" h="full" p="4" gap="2">
        <HStack justify="space-between" align="start">
          <HStack gap="1" wrap="wrap">
            <Badge size="sm" variant="solid" colorPalette="gray">
              {STORE_KIND_LABELS[product.kind]}
            </Badge>
            <Badge size="sm" variant="subtle" colorPalette="gray">
              {product.genre}
            </Badge>
          </HStack>
          <Box aria-hidden color="whiteAlpha.700">
            <Icon size={22} />
          </Box>
        </HStack>
        <Stack gap="0">
          <Heading as="h3" size="md" fontWeight="semibold">
            {product.title}
          </Heading>
          <Text textStyle="xs" color="whiteAlpha.800">
            {detailLine(product)}
          </Text>
        </Stack>
        <Text textStyle="sm" lineClamp={{ base: 2, md: 3 }} color="whiteAlpha.900" flex="1">
          {product.description}
        </Text>
        <HStack justify="space-between" align="center">
          <Text fontWeight="semibold">{formatPrice(product.priceCents)}</Text>
          <Badge size="sm" variant="outline" colorPalette="gray" color="whiteAlpha.900">
            Coming soon
          </Badge>
        </HStack>
      </Stack>
    </Box>
  );
}

/** The List view: a row per product, as the Stories page's list has a row per story. */
function StoreTable({ products }: { products: readonly StoreProduct[] }) {
  return (
    <Table.ScrollArea>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Product</Table.ColumnHeader>
            <Table.ColumnHeader>Type</Table.ColumnHeader>
            <Table.ColumnHeader>Genre</Table.ColumnHeader>
            <Table.ColumnHeader>System</Table.ColumnHeader>
            <Table.ColumnHeader>Contents</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Price</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {products.map((product) => (
            <Table.Row key={product.id} aria-label={product.title}>
              <Table.Cell>
                <Stack gap="0" minW="0" maxW="md">
                  <Text fontWeight="medium">{product.title}</Text>
                  <Text textStyle="xs" color="fg.muted" truncate>
                    {product.description}
                  </Text>
                </Stack>
              </Table.Cell>
              <Table.Cell>{STORE_KIND_LABELS[product.kind]}</Table.Cell>
              <Table.Cell>{product.genre}</Table.Cell>
              <Table.Cell>
                {product.system ?? (
                  <Text as="span" color="fg.subtle">
                    Any
                  </Text>
                )}
              </Table.Cell>
              <Table.Cell whiteSpace="nowrap">{product.contents}</Table.Cell>
              <Table.Cell textAlign="end" whiteSpace="nowrap">
                {formatPrice(product.priceCents)}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
