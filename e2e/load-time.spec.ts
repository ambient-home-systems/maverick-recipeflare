import { expect, test } from "@playwright/test";
import { appInstalled, emptyLibrary, makeRecipe } from "./helpers";

/**
 * How long the list takes to show on a slow phone and a slow connection. The
 * phone is imitated: the processor is held to a quarter of its speed and the
 * network to a slow 4G link. It is a guard against the app growing heavy, with
 * room to spare; it is not a measurement of any real phone.
 */

const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

test("the list shows within a few seconds on a slow phone, and sooner once installed", async ({
  page,
  request,
}) => {
  await emptyLibrary(request);
  for (let n = 1; n <= 30; n++) {
    await makeRecipe(request, `Slow Phone Supper ${String(n).padStart(2, "0")}`);
  }

  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", SLOW_4G);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const row = page.getByRole("link", { name: /Slow Phone Supper 01/ });

  // The first visit ever: everything comes over the network.
  let started = Date.now();
  await page.goto("/?sort=title");
  await expect(row).toBeVisible({ timeout: 30_000 });
  const first = Date.now() - started;

  // Once the app is on the device, its own files no longer travel.
  await appInstalled(page);
  started = Date.now();
  await page.reload();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const again = Date.now() - started;

  test.info().annotations.push({
    type: "load time",
    description: `first visit ${first} ms, once installed ${again} ms`,
  });
  console.log(
    `load time on an imitated slow phone: first visit ${first} ms, once installed ${again} ms`,
  );
  expect(first).toBeLessThan(12_000);
  expect(again).toBeLessThan(6_000);
});
