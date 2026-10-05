/** Generate a random UUID for record IDs (so backup merge never collides). */
export function uuid(): string {
  return crypto.randomUUID();
}
