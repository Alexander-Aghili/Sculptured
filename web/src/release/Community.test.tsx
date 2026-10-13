import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Community } from "./Community";
vi.mock("./Nav", () => ({ hosted: true }));
let calls: { url: string; method: string; body: unknown }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      return new Response(
        JSON.stringify(
          url.endsWith("/me")
            ? {
                user: { id: "me", name: "Member", settings: {}, admin: false },
                csrf: "fixture-csrf",
              }
            : { id: "published", version: 1 },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
it("requires an inspected group and explicit review before publication; strips private fields", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/community/publish"]}>
      <Community />
    </MemoryRouter>,
  );
  const upload = await screen.findByLabelText("Group export");
  const block = {
    id: "example",
    name: "Example",
    revision: 3,
    boundary_notes: ["private"],
    draft: {
      id: "example",
      name: "Example",
      revision: 3,
      folder: "/private",
      groups: [{ id: "g", label: "Group", x: 0, y: 0, w: 300, h: 300 }],
      connections: [],
      agents: [
        {
          id: "a",
          name: "Reviewer",
          kind: "codex",
          group_id: "g",
          job: "Review a fictional paragraph.",
          folder: "/private/agent",
          x: 30,
          y: 40,
          advanced: {
            model: null,
            permission: "unrestricted",
            resume: "resume-if-possible",
          },
        },
      ],
    },
  };
  await user.upload(
    upload,
    new File([JSON.stringify(block)], "example.json", {
      type: "application/json",
    }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Title" }),
    "Example",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Description" }),
    "A reviewed example",
  );
  expect(
    screen.getByRole("button", { name: "Publish publicly" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(
    screen.getByRole("textbox", { name: "Title" }),
  ).toHaveValue("Example");
  await user.click(screen.getByRole("button", { name: "Publish publicly" }));
  await waitFor(() =>
    expect(calls.some((c) => c.method === "POST")).toBe(true),
  );
  const payload = calls.find((c) => c.method === "POST")!
    .body as typeof block & { content: typeof block; reviewed: boolean };
  expect(payload.reviewed).toBe(true);
  expect(payload.content.draft.folder).toBeUndefined();
  expect(payload.content.draft.agents[0].folder).toBeNull();
  expect(payload.content.draft.agents[0].advanced.permission).toBe(
    "restricted",
  );
  expect(payload.content.boundary_notes).toEqual([]);
});
