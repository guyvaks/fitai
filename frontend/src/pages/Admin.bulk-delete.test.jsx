import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BulkDeleteModal } from "./Admin";

describe("BulkDeleteModal", () => {
  it("shows the affected user count and blocks submit until it's typed exactly", () => {
    const onSubmit = vi.fn();
    render(<BulkDeleteModal count={3} onClose={() => {}} onSubmit={onSubmit} />);

    expect(screen.getByText(/עומדים למחוק לצמיתות/)).toBeTruthy();
    expect(screen.getByText(/משתמשים נבחרים/)).toBeTruthy();

    const submitButton = screen.getByRole("button", { name: /מחק 3 משתמשים לצמיתות/ });
    expect(submitButton).toBeDisabled();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "2" } });
    expect(submitButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "3" } });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("never calls onSubmit if the confirmation text is wrong, even on form submit", () => {
    const onSubmit = vi.fn();
    render(<BulkDeleteModal count={5} onClose={() => {}} onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.submit(input.closest("form"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("הקלד 5 כדי לאשר")).toBeTruthy();
  });

  it("closes after a successful confirmed submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<BulkDeleteModal count={2} onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /מחק 2 משתמשים לצמיתות/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
