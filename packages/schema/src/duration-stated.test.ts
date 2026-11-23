import { describe, expect, it } from "vitest";
import { readStatedDuration } from "./duration";

describe("readStatedDuration", () => {
  it.each([
    ["45 minutes", 2700],
    ["45 min", 2700],
    ["45 mins.", 2700],
    ["45min", 2700],
    ["1 hour", 3600],
    ["2 hrs", 7200],
    ["1 hr 30 min", 5400],
    ["1 hour and 15 minutes", 4500],
    ["1 hour, 15 minutes", 4500],
    ["1h 5m", 3900],
    ["1.5 hours", 5400],
    ["1 1/2 hours", 5400],
    ["1½ hours", 5400],
    ["½ hour", 1800],
    ["3/4 hour", 2700],
    ["30 seconds", 30],
    ["2 min 30 sec", 150],
    ["About 20 minutes", 1200],
    ["approx. 1 hour", 3600],
    ["  10 Minutes  ", 600],
  ])("reads %j", (text, seconds) => {
    expect(readStatedDuration(text)).toBe(seconds);
  });

  it.each([
    "",
    "45",
    "minutes",
    "20 to 25 minutes",
    "20-25 minutes",
    "20–25 min",
    "overnight",
    "45 minutes, plus chilling",
    "until golden",
    "30 min 1 hr",
    "1 hr 2 hr",
    "0 minutes",
    "1/0 hour",
    "350 degrees",
    "PT45M",
  ])("reads nothing from %j", (text) => {
    expect(readStatedDuration(text)).toBeNull();
  });
});
