import { describe, expect, it } from "vitest";
import { isPhotoPath, mayKeep, overLimit, servesApp, shellVersion } from "./rules";

const ID = "0193a000-0000-7000-8000-000000000001";

describe("what the service worker keeps", () => {
  it("keeps a plain success from this site", () => {
    expect(mayKeep({ status: 200, type: "basic", redirected: false })).toBe(true);
  });

  it("never keeps the redirect to the sign-in page, however it arrives", () => {
    // Followed to another site by an image or a script: opaque, with no status.
    expect(mayKeep({ status: 0, type: "opaque", redirected: false })).toBe(false);
    // Not followed.
    expect(mayKeep({ status: 0, type: "opaqueredirect", redirected: false })).toBe(false);
    // Followed, and answered by a page that says 200.
    expect(mayKeep({ status: 200, type: "basic", redirected: true })).toBe(false);
    expect(mayKeep({ status: 200, type: "cors", redirected: true })).toBe(false);
  });

  it("never keeps a refusal or a failure", () => {
    for (const status of [204, 206, 302, 401, 403, 404, 500, 503]) {
      expect(mayKeep({ status, type: "basic", redirected: false })).toBe(false);
    }
  });
});

describe("which requests are photos", () => {
  it("knows a stored photo's address in each size", () => {
    for (const size of ["original", "thumb", "full"]) {
      expect(isPhotoPath(`/api/v1/assets/${ID}/${size}`)).toBe(true);
    }
  });

  it("leaves every other address of the API alone", () => {
    expect(isPhotoPath("/api/v1/assets")).toBe(false);
    expect(isPhotoPath(`/api/v1/assets/${ID}`)).toBe(false);
    expect(isPhotoPath(`/api/v1/assets/${ID}/poster`)).toBe(false);
    expect(isPhotoPath(`/api/v1/recipes/${ID}`)).toBe(false);
    expect(isPhotoPath("/api/v1/me")).toBe(false);
    expect(isPhotoPath(`/x/api/v1/assets/${ID}/thumb`)).toBe(false);
  });
});

describe("which page loads are answered with the app", () => {
  it("answers every address of the app", () => {
    for (const path of ["/", "/add", "/recipes/plum-cake", "/recipes/plum-cake/cook", "/apis"]) {
      expect(servesApp(path)).toBe(true);
    }
  });

  it("leaves the API's addresses to the server, so signing in again reaches the sign-in page", () => {
    expect(servesApp("/api/v1/auth/refresh")).toBe(false);
    expect(servesApp("/api/v1/assets/x/original")).toBe(false);
    expect(servesApp("/api")).toBe(false);
    expect(servesApp("/api/")).toBe(false);
  });
});

describe("letting old photos go", () => {
  it("lets nothing go under the limit", () => {
    expect(overLimit([1, 2, 3], 4)).toEqual([]);
    expect(overLimit([1, 2, 3, 4], 4)).toEqual([]);
  });

  it("lets the oldest go, and a few more so it is not done for every photo", () => {
    const keys = Array.from({ length: 17 }, (_, index) => index);

    // One over a limit of 16: that one and two more (an eighth of the limit) go, oldest first.
    expect(overLimit(keys, 16)).toEqual([0, 1, 2]);
  });
});

describe("naming a build of the app", () => {
  const files = [
    { url: "index.html", revision: "a1" },
    { url: "assets/index-abc.js", revision: null },
  ];

  it("gives the same files the same name", () => {
    expect(shellVersion(files)).toBe(shellVersion(files.map((file) => ({ ...file }))));
  });

  it("gives a different name when a file or its revision changes", () => {
    const name = shellVersion(files);

    expect(shellVersion([{ url: "index.html", revision: "a2" }, ...files.slice(1)])).not.toBe(name);
    expect(shellVersion([...files, { url: "icon.svg", revision: "z" }])).not.toBe(name);
  });
});
