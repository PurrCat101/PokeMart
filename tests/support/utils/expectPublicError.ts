import { APIResponse, expect } from '@playwright/test';

type PublicError = {
  status: number;
  code: string;
  message: string;
  requestId: string;
  details: Array<{ field: string; message: string }>;
};

export async function expectPublicError(response: APIResponse, expected: PublicError): Promise<void> {
  expect(response.status()).toBe(expected.status);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['x-request-id']).toBe(expected.requestId);
  expect(await response.json()).toEqual({
    error: {
      code: expected.code,
      message: expected.message,
      requestId: expected.requestId,
      details: expected.details,
    },
  });
}
