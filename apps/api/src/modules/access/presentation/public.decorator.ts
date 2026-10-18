import { SetMetadata } from '@nestjs/common';
import { PUBLIC_ROUTE_KEY } from '../application/request-identity';

/** Opts a route or controller out of the global JWT guard, for example the health check. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE_KEY, true);
