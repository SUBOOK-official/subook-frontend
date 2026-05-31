import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPopularityMetrics,
  sortStorefrontProducts,
} from "./publicStoreSorting.js";

test("buildPopularityMetrics falls back to option-level counts when product totals are missing", () => {
  const metrics = buildPopularityMetrics(
    {},
    [
      { sales_count: 2, view_count: 15, favorite_count: 4 },
      { sales_count: 1, view_count: 5, favorite_count: 1 },
    ],
  );

  assert.deepEqual(metrics, {
    salesCount: 3,
    viewCount: 20,
    favoriteCount: 5,
    score: 3020005,
  });
});

test("sortStorefrontProducts ranks popular items by sales, then views, then favorites", () => {
  const sorted = sortStorefrontProducts(
    [
      {
        id: "favorite-heavy",
        title: "favorite-heavy",
        createdAt: "2026-04-03T09:00:00.000Z",
        salesCount: 2,
        viewCount: 50,
        favoriteCount: 99,
      },
      {
        id: "sales-heavy",
        title: "sales-heavy",
        createdAt: "2026-04-01T09:00:00.000Z",
        salesCount: 3,
        viewCount: 10,
        favoriteCount: 1,
      },
      {
        id: "view-heavy",
        title: "view-heavy",
        createdAt: "2026-04-02T09:00:00.000Z",
        salesCount: 2,
        viewCount: 70,
        favoriteCount: 1,
      },
    ],
    "popular",
  );

  assert.deepEqual(
    sorted.map((product) => product.id),
    ["sales-heavy", "view-heavy", "favorite-heavy"],
  );
});

test("sortStorefrontProducts uses price and latest fallbacks for the remaining sort options", () => {
  const products = [
    {
      id: "first",
      title: "first",
      price: 12000,
      createdAt: "2026-04-01T09:00:00.000Z",
    },
    {
      id: "second",
      title: "second",
      lowestPrice: 9000,
      highestPrice: 15000,
      createdAt: "2026-04-03T09:00:00.000Z",
    },
    {
      id: "third",
      title: "third",
      price: 18000,
      createdAt: "2026-04-02T09:00:00.000Z",
    },
  ];

  assert.deepEqual(
    sortStorefrontProducts(products, "price_asc").map((product) => product.id),
    ["second", "first", "third"],
  );
  assert.deepEqual(
    sortStorefrontProducts(products, "price_desc").map((product) => product.id),
    ["third", "second", "first"],
  );
  assert.deepEqual(
    sortStorefrontProducts(products, "latest").map((product) => product.id),
    ["second", "third", "first"],
  );
});
