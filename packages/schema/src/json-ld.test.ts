import { describe, expect, it } from "vitest";
import { SENT_PAGE_LIMITS, SentPage, UrlImportRequest } from "./import-job";
import { findRecipe } from "./json-ld";

const block = (data: unknown) => JSON.stringify(data);

describe("finding the recipe a page describes", () => {
  it("finds one at the top of a block", () => {
    expect(findRecipe([block({ "@type": "Recipe", name: "Plum Cake" })])?.name).toBe("Plum Cake");
  });

  it("finds one in a list, in a graph, as a main entity, and typed as two things", () => {
    const recipe = { "@type": ["Recipe", "NewsArticle"], name: "Found" };

    expect(findRecipe([block([{ "@type": "BreadcrumbList" }, recipe])])?.name).toBe("Found");
    expect(findRecipe([block({ "@graph": [{ "@type": "WebSite" }, recipe] })])?.name).toBe("Found");
    expect(findRecipe([block({ "@type": "WebPage", mainEntity: recipe })])?.name).toBe("Found");
  });

  it("passes over a block that is not JSON, and mends a line break typed inside a string", () => {
    const broken = '{ "@type": "Recipe", "name": ';
    const mended = '{ "@type": "Recipe", "name": "Mended\nSoup" }';

    expect(findRecipe([broken, mended])?.name).toBe("Mended Soup");
  });

  it("finds nothing where no recipe is described", () => {
    expect(findRecipe([])).toBeNull();
    expect(findRecipe(["{", block({ "@type": "Article" }), "[]", "null", '"Recipe"'])).toBeNull();
  });

  it("does not go round for ever in data nested very deep", () => {
    let deep: unknown = { "@type": "Recipe", name: "Too Deep" };
    for (let i = 0; i < 20; i++) {
      deep = { "@graph": [deep] };
    }

    expect(findRecipe([block(deep)])).toBeNull();
  });
});

describe("a page sent by the browser", () => {
  const page = { url: "https://kitchen.example.com/plum-cake", blocks: ["{}"] };

  it("needs a web address and takes the site's name when there is one", () => {
    expect(SentPage.parse(page)).toEqual({ ...page, siteName: null, text: null });
    expect(SentPage.parse({ ...page, siteName: "Kitchen" }).siteName).toBe("Kitchen");
    expect(SentPage.safeParse({ ...page, url: "about:blank" }).success).toBe(false);
    expect(SentPage.safeParse({ ...page, url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("is capped: so many blocks, each so long", () => {
    const many = Array.from({ length: SENT_PAGE_LIMITS.blocks + 1 }, () => "{}");
    const long = "x".repeat(SENT_PAGE_LIMITS.blockLength + 1);

    expect(SentPage.safeParse({ ...page, blocks: many }).success).toBe(false);
    expect(SentPage.safeParse({ ...page, blocks: [long] }).success).toBe(false);
  });

  it("rides along with an import from a link, or is left out", () => {
    const link = { kind: "url", url: page.url };

    expect(UrlImportRequest.parse(link).page).toBeUndefined();
    expect(
      UrlImportRequest.parse({ ...link, page: { siteName: null, blocks: page.blocks } }).page,
    ).toEqual({ siteName: null, blocks: page.blocks, text: null });
  });

  it("can carry the page's words in place of blocks, up to the limit for pasted text", () => {
    const words = { ...page, blocks: [], text: "Biscuits\n2 cups flour" };

    expect(SentPage.parse(words).text).toBe("Biscuits\n2 cups flour");
    expect(SentPage.safeParse({ ...words, text: "x".repeat(50_001) }).success).toBe(false);
  });
});
