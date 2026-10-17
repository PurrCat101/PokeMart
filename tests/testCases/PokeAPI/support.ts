export function internalHeaders(userId: string, requestId = 'tc-pokeapi-request'): Record<string, string> {
  return { 'X-User-Id': userId, 'X-Request-Id': requestId };
}
