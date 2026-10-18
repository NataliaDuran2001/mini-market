// One `export *` line per module, sorted alphabetically. Each module keeps its tables in
// `modules/<domain>/infrastructure/schema.ts`.
export * from '../../modules/access/infrastructure/schema';
// `modules/<domain>/infrastructure/schema.ts`. Example:
//
// export * from '../../modules/sales/infrastructure/schema';
export * from '../../modules/tenancy/infrastructure/schema';
export {};
