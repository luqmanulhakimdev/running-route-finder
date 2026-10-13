import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "./layout";

describe("RootLayout & metadata", () => {
  it("defines correct application metadata", () => {
    expect(metadata.title).toBe("RunRoute — Temukan rute lari");
    expect(metadata.description).toContain(
      "Temukan alternatif rute lari nyata",
    );
  });

  it("renders html root with Indonesian language attribute and body", () => {
    const tree = RootLayout({ children: "test-child" });
    expect(tree.type).toBe("html");
    expect(tree.props.lang).toBe("id");
    expect(tree.props.children.type).toBe("body");
    expect(tree.props.children.props.children).toBe("test-child");
  });
});
