import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@/ui/card';

/** Shared frame of the public auth pages: phone first, centered on wide screens. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-md py-6">
      <Card>
        <CardHeader>
          <h1 className="text-xl leading-none font-semibold">{title}</h1>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    </section>
  );
}
