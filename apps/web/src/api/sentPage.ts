import { findRecipe, LIMITS, SENT_PAGE_LIMITS, SentPage } from "@recipeflare/schema";
import type { z } from "zod";

/**
 * A recipe page sent to the app by the cook's own browser.
 *
 * Some sites answer a person's browser and refuse everything else, the app's
 * server included. The "Send to Recipeflare" bookmark runs in the browser, on
 * the page the cook is looking at: it gathers what the page says about its
 * recipe and opens the app's Add page with that in the address, after the
 * `#`, where it never travels to any server. The Add page reads it and asks
 * before importing, because any site could open such an address.
 */

/** The start of the address fragment that carries a sent page. */
export const SENT_PAGE_PREFIX = "#page=";

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (character) =>
    character.charCodeAt(0),
  );

/** A page as the fragment of an address, as the bookmark writes it. */
export function encodeSentPage(page: z.input<typeof SentPage>): string {
  return SENT_PAGE_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(page)));
}

export type SentPageReading =
  | {
      ok: true;
      page: SentPage;
      host: string;
      recipeName: string | null;
      /** True when the page describes no recipe, and its words were sent for a model to read. */
      fromText: boolean;
    }
  | { ok: false; problem: string };

/** The site a page is on, without the "www". */
const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/**
 * Reads a sent page from an address's fragment. Null when the fragment
 * carries none. A page that cannot be used comes back with the reason, in
 * words for the cook.
 */
export function readSentPage(hash: string): SentPageReading | null {
  if (!hash.startsWith(SENT_PAGE_PREFIX)) {
    return null;
  }
  let parsed: ReturnType<typeof SentPage.safeParse>;
  try {
    const json = new TextDecoder().decode(fromBase64Url(hash.slice(SENT_PAGE_PREFIX.length)));
    parsed = SentPage.safeParse(JSON.parse(json));
  } catch {
    return { ok: false, problem: "What the bookmark sent could not be read. Try it again." };
  }
  if (!parsed.success) {
    return {
      ok: false,
      problem:
        "What the bookmark sent could not be used. It works on a recipe's own page, not on a search or a list.",
    };
  }
  const page = parsed.data;
  if (page.blocks.join("").length > SENT_PAGE_LIMITS.totalLength) {
    return { ok: false, problem: "That page is too large to import." };
  }
  const recipe = findRecipe(page.blocks);
  if (!recipe && page.text?.trim()) {
    return { ok: true, page, host: hostOf(page.url), recipeName: null, fromText: true };
  }
  if (!recipe) {
    return {
      ok: false,
      problem: `No recipe was found on that page of ${hostOf(page.url)}. The bookmark works on a recipe's own page.`,
    };
  }
  const name = typeof recipe.name === "string" ? recipe.name.replace(/<[^>]*>/g, "").trim() : "";
  return { ok: true, page, host: hostOf(page.url), recipeName: name || null, fromText: false };
}

/**
 * The bookmark itself: a line of script for the browser's bookmarks bar. It
 * reads the page it is run on and opens the app with what it found. `origin`
 * is the app's own address, taken from the page that shows the bookmark, so
 * no install's address is ever written in the code.
 *
 * It is written out in full because it runs on other sites' pages, where
 * nothing of the app exists. It sends only the blocks that mention a recipe.
 * A page with none is sent as its words, the article's if it has one, for a
 * model to copy the recipe out of.
 */
export function bookmarkletFor(origin: string): string {
  const target = JSON.stringify(`${origin}/add${SENT_PAGE_PREFIX}`);
  const script = `(function(){
var d=document,b=[],s=d.querySelectorAll('script[type="application/ld+json"]'),i,t;
for(i=0;i<s.length&&b.length<${SENT_PAGE_LIMITS.blocks};i++){t=s[i].textContent||"";if(t.indexOf("Recipe")>-1&&t.length<=${SENT_PAGE_LIMITS.blockLength})b.push(t)}
var m=d.querySelector('meta[property="og:site_name"]');
var w=b.length?null:((d.querySelector("article,main")||d.body).innerText||"").slice(0,${LIMITS.pastedText});
var p=JSON.stringify({url:location.href,siteName:m&&m.content?m.content.slice(0,200):null,blocks:b,text:w});
var u=new TextEncoder().encode(p),c="";
for(i=0;i<u.length;i++)c+=String.fromCharCode(u[i]);
var a=${target}+btoa(c).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
if(!window.open(a,"_blank"))location.href=a;
})();`;
  return `javascript:${encodeURIComponent(script.replace(/\n/g, ""))}`;
}
