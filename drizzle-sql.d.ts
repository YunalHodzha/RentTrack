// Allow importing drizzle-kit generated .sql migration files (bundled via Metro).
declare module '*.sql' {
  const content: string;
  export default content;
}
