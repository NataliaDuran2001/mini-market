import { createFileRoute } from '@tanstack/react-router';
import { requirePermission } from '@/features/auth';
import { SuppliersPage } from '@/features/purchasing';

export const Route = createFileRoute('/_authenticated/compras/proveedores')({
  beforeLoad: requirePermission('purchases.create'),
  component: SuppliersPage,
});
