import { HealthResponse } from "@recipeflare/schema";

/**
 * Base URL of the API. Empty means the same origin as the app. It is a setting
 * so that a native wrapper can point the app at a household's server later.
 */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/api/v1/health`, { signal });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return HealthResponse.parse(await response.json());
}
