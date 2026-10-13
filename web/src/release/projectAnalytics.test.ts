import { it, expect } from "vitest";
import { ev } from "../test-fixtures";
import { projectContext, turnTimings } from "./projectAnalytics";
it("keeps identical tool call IDs from different agents separate", () => {
  const events = [
    ev(
      1,
      {
        type: "tool-called",
        call_id: "same",
        name: "Reader",
        input: { path: "a.ts" },
        turn_id: "t",
        parent_call_id: null,
      },
      "a",
    ),
    ev(
      2,
      {
        type: "tool-called",
        call_id: "same",
        name: "Internal",
        input: {},
        turn_id: "t",
        parent_call_id: "parent",
      },
      "b",
    ),
    ev(
      3,
      {
        type: "tool-resulted",
        call_id: "same",
        output: "Visible result",
        is_error: false,
        turn_id: "t",
      },
      "a",
    ),
  ];
  const c = projectContext(events.reverse());
  expect(c.categories.find((c) => c.kind === "tool-results")?.count).toBe(1);
  expect(c.entries.find((e) => e.text === "Visible result")?.label).toBe(
    "Reader result",
  );
});
it("pairs turn timings by agent as well as turn ID", () => {
  const e = [
    ev(1, { type: "turn-started", turn_id: "t" }, "a"),
    ev(2, { type: "turn-ended", turn_id: "t", status: "completed" }, "b"),
  ];
  expect(turnTimings(e)).toEqual({ durations: [], unmatched: 1, open: 1 });
});
