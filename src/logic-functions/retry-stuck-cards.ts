import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';

import { CARD_STATUS } from 'src/objects/scanned-card.object';
import { readScannedCard } from 'src/utils/read-scanned-card';

const STUCK_AFTER_MS = 5 * 60 * 1000;
const MAX_PER_RUN = 10;

// A read can be cut off (a server restart, an app update). Any card still "Reading"
// after five minutes is read again, a few per run.
const handler = async () => {
  const before = new Date(Date.now() - STUCK_AFTER_MS).toISOString();

  const stuck = (await new CoreApiClient().query({
    scannedCards: {
      __args: {
        filter: { status: { eq: CARD_STATUS.READING }, updatedAt: { lt: before } },
        first: MAX_PER_RUN,
      },
      edges: { node: { id: true } },
    },
  })) as { scannedCards: { edges: { node: { id: string } }[] } };

  let retried = 0;

  for (const { node } of stuck.scannedCards.edges) {
    await readScannedCard(node.id);
    retried++;
  }

  return { retried };
};

export default defineLogicFunction({
  universalIdentifier: 'f0d2c11b-d794-474a-a5e6-b59838224b91',
  name: 'retry-stuck-cards',
  description: 'Reads again any scanned card stuck in Reading for over five minutes.',
  timeoutSeconds: 300,
  handler,
  cronTriggerSettings: { pattern: '*/5 * * * *' },
});
