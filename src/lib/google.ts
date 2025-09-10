export function isGoogleEnabled() {
  return typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
}

