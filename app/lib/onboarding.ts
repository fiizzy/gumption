// Whether the welcome tour has been shown on this computer. The value is a
// version, so a tour with new steps can be shown once more to people who
// saw the old one.
const ONBOARDING_STORAGE_KEY = "canvas-chat:onboarding";
const ONBOARDING_VERSION = "1";

export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === ONBOARDING_VERSION;
  } catch {
    // Without storage the tour would come back on every launch, which is
    // worse than never showing it.
    return true;
  }
}

export function markOnboardingSeen(): void {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION);
  } catch {
    // A convenience; nothing to do if storage is unavailable.
  }
}
