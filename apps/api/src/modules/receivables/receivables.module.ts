import { Module } from '@nestjs/common';
import type { Clock } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { CLOCK, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { AUDIT_PORT, permissionsProvider } from '../access';
import type { AuditPort } from '../access';
import { CREATE_CUSTOMER, createCustomer } from './application/create-customer';
import {
  GET_CUSTOMER_STATEMENT,
  getCustomerStatement,
} from './application/get-customer-statement';
import { LIST_BALANCES, listBalances } from './application/list-balances';
import type { CreditLedgerRepository } from './application/ports/credit-ledger.repository';
import type { CustomerRepository } from './application/ports/customer.repository';
import { REGISTER_CHARGE, registerCharge } from './application/register-charge';
import { REGISTER_COLLECTION, registerCollection } from './application/register-collection';
import { REVERSE_CHARGE, reverseCharge } from './application/reverse-charge';
import { SEARCH_CUSTOMERS, searchCustomers } from './application/search-customers';
import { CREDIT_LEDGER_REPOSITORY, CUSTOMER_REPOSITORY } from './application/tokens';
import { UPDATE_CUSTOMER, updateCustomer } from './application/update-customer';
import { DrizzleCreditLedgerRepository } from './infrastructure/drizzle-credit-ledger.repository';
import { DrizzleCustomerRepository } from './infrastructure/drizzle-customer.repository';
import { CustomersController } from './presentation/customers.controller';
import { ReceivablesController } from './presentation/receivables.controller';
import { RECEIVABLES_PERMISSIONS } from './receivables.permissions';

interface Deps {
  readonly customers: CustomerRepository;
  readonly ledger: CreditLedgerRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/** Every use case gets the same bag of dependencies and takes the ones it needs. */
const useCase = (token: symbol, build: (deps: Deps) => unknown) => ({
  provide: token,
  useFactory: (
    customers: CustomerRepository,
    ledger: CreditLedgerRepository,
    audit: AuditPort,
    clock: Clock,
    withTransaction: WithTransaction,
  ) => build({ customers, ledger, audit, clock, withTransaction }),
  inject: [CUSTOMER_REPOSITORY, CREDIT_LEDGER_REPOSITORY, AUDIT_PORT, CLOCK, WITH_TRANSACTION],
});

@Module({
  controllers: [CustomersController, ReceivablesController],
  providers: [
    permissionsProvider('receivables', RECEIVABLES_PERMISSIONS),
    { provide: CUSTOMER_REPOSITORY, useFactory: () => new DrizzleCustomerRepository() },
    { provide: CREDIT_LEDGER_REPOSITORY, useFactory: () => new DrizzleCreditLedgerRepository() },
    useCase(SEARCH_CUSTOMERS, (deps) => searchCustomers.bind(null, deps)),
    useCase(CREATE_CUSTOMER, (deps) => createCustomer.bind(null, deps)),
    useCase(UPDATE_CUSTOMER, (deps) => updateCustomer.bind(null, deps)),
    useCase(GET_CUSTOMER_STATEMENT, (deps) => getCustomerStatement.bind(null, deps)),
    useCase(REGISTER_COLLECTION, (deps) => registerCollection.bind(null, deps)),
    useCase(LIST_BALANCES, (deps) => listBalances.bind(null, deps)),
    useCase(REGISTER_CHARGE, (deps) => registerCharge.bind(null, deps)),
    useCase(REVERSE_CHARGE, (deps) => reverseCharge.bind(null, deps)),
  ],
  exports: [REGISTER_CHARGE, REVERSE_CHARGE],
})
export class ReceivablesModule {}
