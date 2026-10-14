/**
 * Nest `forwardRef` token that defers `require` until DI resolves.
 * Use with `import type` for the class — avoids SWC/CommonJS circular TDZ:
 *   Cannot access 'XService' before initialization
 *
 * @example
 * import type { FooService } from '../foo/foo.service';
 * @Inject(forwardRef(lazyService(() => require('../foo/foo.service').FooService)))
 * private readonly foo: FooService
 */
export function lazyService<T>(load: () => T): () => T {
  return load;
}
