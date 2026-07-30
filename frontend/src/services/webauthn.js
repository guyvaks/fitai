import { authAPI } from "./api";

// Shared by VerifyEmail.jsx's post-registration opt-in prompt and
// Settings.jsx's "add device" button -- both run the exact same
// registration ceremony against an already-authenticated session.
export async function runWebAuthnRegistration() {
  const { startRegistration } = await import("@simplewebauthn/browser");
  const { data: optionsData } = await authAPI.webauthnRegisterOptions();
  const credential = await startRegistration({ optionsJSON: optionsData.options });
  await authAPI.webauthnRegisterVerify(optionsData.challenge_token, credential);
}

export async function isWebAuthnPlatformAvailable() {
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Conditional UI / autofill support -- distinct capability from platform-
// authenticator availability above. When available, the browser can arm a
// text input (marked autoComplete="username webauthn") with a passkey
// suggestion in its native autofill dropdown, so a discoverable credential
// can be used with zero clicks: no button, no typed username. Used by
// Login.jsx's proactive login attempt.
export async function isConditionalMediationAvailable() {
  if (!window.PublicKeyCredential?.isConditionalMediationAvailable) return false;
  try {
    return await window.PublicKeyCredential.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}
