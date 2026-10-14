import {
  LOCAL_NEST_API_URL,
  RAILWAY_NEST_API_URL,
  isLoopbackNestApiUrl,
  resolveNestBackendUrl,
} from './nest-backend-url';

describe('nest-backend-url', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.API_BACKEND_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('uses localhost in development regardless of deploy env vars', () => {
    process.env.NODE_ENV = 'development';
    process.env.API_BACKEND_URL = RAILWAY_NEST_API_URL;
    expect(resolveNestBackendUrl()).toBe(LOCAL_NEST_API_URL);
  });

  it('uses configured Railway URL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_BACKEND_URL = RAILWAY_NEST_API_URL;
    expect(resolveNestBackendUrl()).toBe(RAILWAY_NEST_API_URL);
  });

  it('rewrites loopback to Railway in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_BACKEND_URL = LOCAL_NEST_API_URL;
    expect(resolveNestBackendUrl()).toBe(RAILWAY_NEST_API_URL);
  });

  it('falls back to Railway when production env is unset', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveNestBackendUrl()).toBe(RAILWAY_NEST_API_URL);
  });

  it('prefers explicit env bindings over process.env', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_BACKEND_URL = LOCAL_NEST_API_URL;
    expect(
      resolveNestBackendUrl({
        API_BACKEND_URL: 'https://custom.example.com',
      }),
    ).toBe('https://custom.example.com');
  });

  it('detects loopback hosts', () => {
    expect(isLoopbackNestApiUrl('http://127.0.0.1:8080')).toBe(true);
    expect(isLoopbackNestApiUrl('http://localhost:8080')).toBe(true);
    expect(isLoopbackNestApiUrl(RAILWAY_NEST_API_URL)).toBe(false);
  });
});
