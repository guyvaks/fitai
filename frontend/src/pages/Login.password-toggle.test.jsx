import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn(), loginWithToken: vi.fn() }),
}));

vi.mock("../services/api", () => ({
  authAPI: {
    webauthnLoginOptions: vi.fn(),
    webauthnLoginVerify: vi.fn(),
  },
}));

vi.mock("../services/webauthn", () => ({
  isWebAuthnPlatformAvailable: vi.fn().mockResolvedValue(false),
  isConditionalMediationAvailable: vi.fn().mockResolvedValue(false),
}));

describe("Login password show/hide toggle", () => {
  it("toggles the password input between hidden and visible text on click", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const passwordInput = screen.getByPlaceholderText("••••••••");
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggleButton = screen.getByLabelText("הצג סיסמה");
    fireEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("הסתר סיסמה")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("הסתר סיסמה"));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
