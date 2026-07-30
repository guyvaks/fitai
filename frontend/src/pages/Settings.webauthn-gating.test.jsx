import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WebAuthnSettings } from "./Settings";
import { authAPI } from "../services/api";
import { isWebAuthnPlatformAvailable } from "../services/webauthn";

vi.mock("../services/api", () => ({
  authAPI: {
    webauthnListCredentials: vi.fn(),
    webauthnRemoveCredential: vi.fn(),
  },
}));

vi.mock("../services/webauthn", () => ({
  isWebAuthnPlatformAvailable: vi.fn(),
  runWebAuthnRegistration: vi.fn(),
}));

// Regression coverage for the lost/stolen-device gating fix: revoking a
// credential belonging to a device you no longer have must work from a
// machine that doesn't itself support platform authentication -- only
// *registering a new* credential needs that support. See WebAuthnSettings'
// own comment in Settings.jsx for the full rationale.
describe("WebAuthnSettings credential-list gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the credential list and revoke button on an unsupported device that has existing credentials", async () => {
    isWebAuthnPlatformAvailable.mockResolvedValue(false);
    authAPI.webauthnListCredentials.mockResolvedValue({
      data: [{ id: "cred-1", device_label: "iPhone של גיא", created_at: "2026-07-01T00:00:00Z" }],
    });

    render(<WebAuthnSettings />);

    expect(await screen.findByText("iPhone של גיא")).toBeTruthy();
    expect(screen.getByLabelText("הסר מכשיר")).toBeTruthy();
    // The "Add Device" action must NOT be offered on a device without
    // platform-authenticator support, even though the list itself renders.
    expect(screen.queryByText("הוסף מכשיר")).toBeNull();
  });

  it("renders nothing on an unsupported device with no existing credentials", async () => {
    isWebAuthnPlatformAvailable.mockResolvedValue(false);
    authAPI.webauthnListCredentials.mockResolvedValue({ data: [] });

    const { container } = render(<WebAuthnSettings />);

    await waitFor(() => expect(authAPI.webauthnListCredentials).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("shows the Add Device button when the device supports platform authentication", async () => {
    isWebAuthnPlatformAvailable.mockResolvedValue(true);
    authAPI.webauthnListCredentials.mockResolvedValue({ data: [] });

    render(<WebAuthnSettings />);

    expect(await screen.findByText("הוסף מכשיר")).toBeTruthy();
  });
});
