import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(cleanup);

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App", () => {
  it("reports that the API is reachable", async () => {
    const fetchMock = stubFetch(Response.json({ status: "ok" }));

    render(<App />);

    expect(await screen.findByText("The API is reachable.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/health", expect.anything());
  });

  it("reports that the API is not reachable when the request fails", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    render(<App />);

    expect(await screen.findByText("The API is not reachable.")).toBeTruthy();
  });

  it("reports that the API is not reachable when the body has the wrong shape", async () => {
    stubFetch(Response.json({ status: "degraded" }));

    render(<App />);

    expect(await screen.findByText("The API is not reachable.")).toBeTruthy();
  });
});
