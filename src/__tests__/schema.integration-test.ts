import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { describe, expect, it } from 'vitest';

describe('App installation', () => {
  it('should find the installed app in the applications list', async () => {
    const client = new MetadataApiClient();

    const result = await client.query({
      findManyApplications: {
        id: true,
        name: true,
        universalIdentifier: true,
      },
    });

    const app = result.findManyApplications.find(
      (a: { universalIdentifier: string }) =>
        a.universalIdentifier === APPLICATION_UNIVERSAL_IDENTIFIER,
    );

    expect(app).toBeDefined();
  });
});

// Read-only on purpose: these tests may run against a real workspace.
describe('Scanned cards', () => {
  it('can list scanned cards', async () => {
    const result = (await new CoreApiClient().query({
      scannedCards: {
        __args: { first: 1 },
        edges: { node: { id: true, status: true } },
      },
    })) as { scannedCards: { edges: unknown[] } };

    expect(Array.isArray(result.scannedCards.edges)).toBe(true);
  });
});
