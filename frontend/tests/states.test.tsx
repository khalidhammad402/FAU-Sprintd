/** Every query-backed screen renders one of four states: skeleton, error with retry, empty with an action, content. */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryState } from "@/design-system/states";
import { ApiError } from "@/api/client";

type Q = { data: string[] | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => Promise<unknown> };
const base: Q = { data: undefined, isPending: false, isError: false, error: null, refetch: async () => undefined };
const view = (q: Q) =>
  render(
    <QueryState query={q as never} skeleton={<p>skeleton</p>} empty={<p>nothing yet</p>}>
      {(d: string[]) => <p>{`rows: ${d.join(",")}`}</p>}
    </QueryState>,
  );

describe("QueryState", () => {
  it("shows the skeleton while loading", () => {
    view({ ...base, isPending: true });
    expect(screen.getByText("skeleton")).toBeInTheDocument();
  });
  it("shows the error with the backend message and a retry", () => {
    const refetch = vi.fn(async () => undefined);
    view({ ...base, isError: true, error: new ApiError(503, "unavailable", "The scheduler is restarting."), refetch });
    expect(screen.getByRole("alert")).toHaveTextContent("The scheduler is restarting.");
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(refetch).toHaveBeenCalled();
  });
  it("shows the empty state for an empty list", () => {
    view({ ...base, data: [] });
    expect(screen.getByText("nothing yet")).toBeInTheDocument();
  });
  it("shows the content", () => {
    view({ ...base, data: ["a", "b"] });
    expect(screen.getByText("rows: a,b")).toBeInTheDocument();
  });
  it("keeps showing data when a background refetch fails", () => {
    view({ ...base, data: ["a"], isError: true, error: new Error("x") });
    expect(screen.getByText("rows: a")).toBeInTheDocument();
  });
});
