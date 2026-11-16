import type { Trace } from "./types";

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Thrown when the request itself fails (not when the user's code fails). */
export class RequestError extends Error {}

export async function traceCode(code: string): Promise<Trace> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new RequestError(
      `Couldn't reach the server at ${API_URL}. Check that the backend is running.`,
    );
  }

  if (response.status === 503) {
    throw new RequestError(
      "The server is busy running other programs. Try again in a moment.",
    );
  }
  if (response.status === 422) {
    throw new RequestError(
      "The server rejected this request. Code can be at most 10,000 characters.",
    );
  }
  if (!response.ok) {
    throw new RequestError(`The server returned an error (${response.status}).`);
  }
  return (await response.json()) as Trace;
}
