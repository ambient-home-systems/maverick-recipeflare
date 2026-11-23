import { afterEach, describe, expect, it, vi } from "vitest";
import { bookmarkletFor, encodeSentPage, readSentPage, SENT_PAGE_PREFIX } from "./sentPage";

const RECIPE = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Plum Cake with Crème Fraîche",
  recipeIngredient: ["8 plums"],
});
const PAGE = {
  url: "https://www.kitchen.example.com/recipes/plum-cake",
  siteName: "The Invented Kitchen",
  blocks: [RECIPE],
};

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("reading a page the browser sent", () => {
  it("reads back what was sent, and says what it is and where it is from", () => {
    const reading = readSentPage(encodeSentPage(PAGE));

    expect(reading).toEqual({
      ok: true,
      page: { ...PAGE, text: null },
      host: "kitchen.example.com",
      recipeName: "Plum Cake with Crème Fraîche",
      fromText: false,
    });
  });

  it("is nothing when the address carries no page", () => {
    expect(readSentPage("")).toBeNull();
    expect(readSentPage("#bookmark")).toBeNull();
  });

  it("says so when the page describes no recipe", () => {
    const reading = readSentPage(
      encodeSentPage({ ...PAGE, blocks: [JSON.stringify({ "@type": "Article" })] }),
    );

    expect(reading).toMatchObject({ ok: false });
    expect(reading && !reading.ok ? reading.problem : "").toContain(
      "No recipe was found on that page of kitchen.example.com",
    );
  });

  it("says so, and does not throw, for anything that is not a page", () => {
    for (const hash of [
      `${SENT_PAGE_PREFIX}not base64 at all!`,
      `${SENT_PAGE_PREFIX}${btoa("not json")}`,
      encodeSentPage({ ...PAGE, url: "about:blank" }),
      `${SENT_PAGE_PREFIX}${btoa(JSON.stringify({ blocks: "no" }))}`,
    ]) {
      expect(readSentPage(hash)).toMatchObject({ ok: false });
    }
  });

  it("turns away a page that is too large", () => {
    const reading = readSentPage(
      encodeSentPage({ ...PAGE, blocks: [RECIPE, "x".repeat(350_000), "y".repeat(350_000)] }),
    );

    expect(reading).toEqual({ ok: false, problem: "That page is too large to import." });
  });
});

describe("the bookmark", () => {
  /** Runs the bookmark as a browser would, on the page that is in the document. */
  function press(origin: string) {
    const opened: string[] = [];
    vi.stubGlobal("open", (address: string) => {
      opened.push(address);
      return {};
    });
    const code = decodeURIComponent(bookmarkletFor(origin).replace(/^javascript:/, ""));
    // biome-ignore lint/security/noGlobalEval: the bookmark is a script, and running it is what is being tested
    globalThis.eval(code);
    return opened;
  }

  it("is a script for the bookmarks bar that names the app it was made on, and no other", () => {
    const bookmark = bookmarkletFor("https://recipes.example.com");

    expect(bookmark.startsWith("javascript:")).toBe(true);
    expect(decodeURIComponent(bookmark)).toContain('"https://recipes.example.com/add#page="');
    expect(bookmark).not.toContain("\n");
  });

  it("sends the page's recipe blocks, its address and the site's name to the app's Add page", () => {
    document.head.innerHTML = `
      <meta property="og:site_name" content="The Invented Kitchen">
      <script type="application/ld+json">${JSON.stringify({ "@type": "WebSite", name: "Kitchen" })}</script>
      <script type="application/ld+json">${RECIPE}</script>`;

    const [address] = press("https://recipes.example.com");

    expect(address?.startsWith("https://recipes.example.com/add#page=")).toBe(true);
    const reading = readSentPage(new URL(address ?? "").hash);
    expect(reading).toMatchObject({
      ok: true,
      recipeName: "Plum Cake with Crème Fraîche",
      // Only the block that mentions a recipe is sent.
      page: { url: window.location.href, siteName: "The Invented Kitchen", blocks: [RECIPE] },
    });
  });

  it("sends the page's words when the page describes no recipe, for a model to read", () => {
    document.body.innerHTML =
      "<nav>Recipes About</nav><article><h1>Biscuits</h1><p>2 cups flour</p></article><footer>Copyright</footer>";

    const [address] = press("https://recipes.example.com");

    const reading = readSentPage(new URL(address ?? "").hash);
    expect(reading).toMatchObject({ ok: true, fromText: true, recipeName: null });
    const text = reading?.ok ? (reading.page.text ?? "") : "";
    // The article's words, and not the site's furniture around it.
    expect(text).toContain("Biscuits");
    expect(text).toContain("2 cups flour");
    expect(text).not.toContain("Copyright");
    expect(reading?.ok ? reading.page.blocks : null).toEqual([]);
  });

  it("does not send the page's words when the page describes its recipe", () => {
    document.head.innerHTML = `<script type="application/ld+json">${RECIPE}</script>`;
    document.body.innerHTML = "<article><h1>Plum Cake</h1><p>A long story.</p></article>";

    const [address] = press("https://recipes.example.com");

    expect(readSentPage(new URL(address ?? "").hash)).toMatchObject({
      ok: true,
      fromText: false,
      page: { text: null },
    });
  });

  it("still opens the app on a page with nothing to read, so the app can say so", () => {
    document.body.innerHTML = "";

    const [address] = press("https://recipes.example.com");

    expect(readSentPage(new URL(address ?? "").hash)).toMatchObject({ ok: false });
  });
});
