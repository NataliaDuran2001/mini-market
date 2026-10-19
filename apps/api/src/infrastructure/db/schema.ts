// One `export *` line per module, sorted alphabetically. Each module keeps its tables in
// `modules/<domain>/infrastructure/schema.ts`.
export * from '../../modules/access/infrastructure/schema';
export * from '../../modules/catalog/infrastructure/schema';
// `modules/<domain>/infrastructure/schema.ts`. Example:
//
// export * from '../../modules/sales/infrastructure/schema';
export * from '../../modules/access/infrastructure/schema';
export * from '../../modules/equity/infrastructure/schema';
export * from '../../modules/purchasing/infrastructure/schema';
export * from '../../modules/tenancy/infrastructure/schema';
export {};
