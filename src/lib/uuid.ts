/** Generate a UUID v4 using crypto.getRandomValues */
export function generateId(): string {
  return crypto.getRandomValues(new Uint8Array(16)).reduce((a, b) => {
    if (a.length === 8 || a.length === 13 || a.length === 18) a += '-';
    const x = b.toString(16);
    return a + (x.length === 1 ? '0' + x : x);
  }, '');
}
