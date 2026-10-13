import { describe, expect, it } from "vitest";
import HomePage from "./page";
import RunRouteApp from "@/components/RunRouteApp";

describe("HomePage", () => {
  it("renders RunRouteApp component as default home view", () => {
    const tree = HomePage();
    expect(tree.type).toBe(RunRouteApp);
  });
});
