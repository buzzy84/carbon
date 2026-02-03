import type { Integration, IntegrationOptions } from "./types";

/**
 * Ensures the code is running on the server.
 * Throws an error if called from the browser.
 */
const withServerOnly = () => {
  if (typeof document !== "undefined") {
    throw new Error(
      `Server only integration hooks cannot be used in the browser`
    );
  }
};

/**
 * Defines an integration with type-safe configuration and server-only hook protection.
 *
 * This function:
 * - Validates required fields at definition time
 * - Wraps server-only hooks (onInstall, onUninstall, onHealthcheck) with browser guards
 * - Preserves full type information for the integration config
 *
 * @example
 * ```ts
 * const MyIntegration = defineIntegration({
 *   name: "My Integration",
 *   id: "my-integration",
 *   active: true,
 *   category: "Tools",
 *   logo: MyLogo,
 *   description: "...",
 *   shortDescription: "...",
 *   images: [],
 *   settings: [],
 *   schema: z.object({}),
 *   onInstall: async (companyId) => { ... },
 *   onHealthcheck: async (companyId, metadata) => { ... },
 * });
 * ```
 */
export function defineIntegration<T extends IntegrationOptions>(
  options: T
): Integration<T> {
  // Validate required fields at definition time
  if (!options.id) {
    throw new Error(`Integration must have an 'id' defined`);
  }
  if (!options.name) {
    throw new Error(`Integration '${options.id}' must have a 'name' defined`);
  }
  if (options.active && options.oauth && !options.oauth.clientId) {
    throw new Error(
      `Integration '${options.id}' has OAuth config but missing clientId`
    );
  }

  return {
    ...options,
    get onInstall() {
      withServerOnly();
      return options.onInstall;
    },
    get onUninstall() {
      withServerOnly();
      return options.onUninstall;
    },
    get onHealthcheck() {
      withServerOnly();
      return options.onHealthcheck;
    }
  } as Integration<T>;
}
