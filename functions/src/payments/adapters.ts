import { squareAdapter } from './square';
import { stripeAdapter } from './stripe';
import type { PaymentAdapter } from './processor';
import type { Processor } from '../domain';

const ADAPTERS: Record<Processor, PaymentAdapter> = {
  square: squareAdapter,
  stripe: stripeAdapter,
};

export function adapterFor(processor: Processor): PaymentAdapter {
  return ADAPTERS[processor];
}
