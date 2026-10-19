import { Module } from '@nestjs/common';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { WITH_TRANSACTION } from '../../infrastructure/tokens';
import { permissionsProvider } from '../access';
import { CREATE_SUPPLIER, createSupplier } from './application/create-supplier';
import { LIST_SUPPLIERS, listSuppliers } from './application/list-suppliers';
import type { SupplierRepository } from './application/ports/supplier.repository';
import { SET_SUPPLIER_ACTIVE, setSupplierActive } from './application/set-supplier-active';
import { SUPPLIER_REPOSITORY } from './application/tokens';
import { UPDATE_SUPPLIER, updateSupplier } from './application/update-supplier';
import { DrizzleSupplierRepository } from './infrastructure/drizzle-supplier.repository';
import { SuppliersController } from './presentation/suppliers.controller';
import { PURCHASING_PERMISSIONS } from './purchasing.permissions';

const useCase = (token: symbol, build: (deps: SupplierDeps) => unknown) => ({
  provide: token,
  useFactory: (suppliers: SupplierRepository, withTransaction: WithTransaction) =>
    build({ suppliers, withTransaction }),
  inject: [SUPPLIER_REPOSITORY, WITH_TRANSACTION],
});

interface SupplierDeps {
  readonly suppliers: SupplierRepository;
  readonly withTransaction: WithTransaction;
}

@Module({
  controllers: [SuppliersController],
  providers: [
    permissionsProvider('purchasing', PURCHASING_PERMISSIONS),
    { provide: SUPPLIER_REPOSITORY, useFactory: () => new DrizzleSupplierRepository() },
    useCase(LIST_SUPPLIERS, (deps) => listSuppliers.bind(null, deps)),
    useCase(CREATE_SUPPLIER, (deps) => createSupplier.bind(null, deps)),
    useCase(UPDATE_SUPPLIER, (deps) => updateSupplier.bind(null, deps)),
    useCase(SET_SUPPLIER_ACTIVE, (deps) => setSupplierActive.bind(null, deps)),
  ],
})
export class PurchasingModule {}
