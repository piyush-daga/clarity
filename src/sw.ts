/// <reference lib="webworker" />
/* Minimal service worker for Clarity with Serwist precache support */
import { precacheAndRoute } from "serwist/legacy";
declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: unknown };

// Injected at build time by @serwist/next (InjectManifest)
precacheAndRoute(self.__SW_MANIFEST as any);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Simple passthrough; can be extended for runtime caching later
self.addEventListener('fetch', (_event) => {
  // No-op runtime caching for now
});
