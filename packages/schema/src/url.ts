/** Query parameters that say where a link was clicked, not what it points at. */
const TRACKING =
  /^(utm_.+|fbclid|gclid|dclid|msclkid|igshid|igsh|mc_cid|mc_eid|ref_src|_hsenc|_hsmi)$/i;

/**
 * A web address in the one form the app stores and compares: the host in
 * lowercase, no fragment, no tracking parameters. Two links to the same recipe
 * page then compare equal, which is how a second import of a page is noticed.
 *
 * Returns the text unchanged if it is not an address.
 */
export function canonicalUrl(text: string): string {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return text;
  }
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING.test(name)) {
      url.searchParams.delete(name);
    }
  }
  // `URL` lowercases the host itself and leaves the path as written.
  return url.toString();
}
