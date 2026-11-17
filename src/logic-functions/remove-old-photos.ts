import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';

import { CARD_STATUS } from 'src/objects/scanned-card.object';

const MAX_PER_RUN = 200;

// Card photos are kept for "Keep card photos (days)" (default 365, 0 = forever) after a
// card is saved or skipped. Cards still waiting for review keep theirs.
const handler = async () => {
  const days = Number(process.env.PHOTO_RETENTION_DAYS ?? 365);

  if (!Number.isFinite(days) || days <= 0) {
    return { removed: 0, keptForever: true };
  }

  const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const client = new CoreApiClient();
  const old = (await client.query({
    scannedCards: {
      __args: {
        filter: { status: { in: [CARD_STATUS.CREATED, CARD_STATUS.SKIPPED] }, updatedAt: { lt: before } },
        first: MAX_PER_RUN,
      },
      edges: { node: { id: true, photo: { fileId: true } } },
    },
  })) as { scannedCards: { edges: { node: { id: string; photo: { fileId: string }[] | null } }[] } };

  let removed = 0;

  for (const { node } of old.scannedCards.edges) {
    if (!node.photo?.length) continue;

    await client.mutation({ updateScannedCard: { __args: { id: node.id, data: { photo: [] } }, id: true } });
    removed++;
  }

  return { removed };
};

export default defineLogicFunction({
  universalIdentifier: '41156492-13d7-4cbd-8cc9-4dbf481eab83',
  name: 'remove-old-photos',
  description: 'Removes card photos older than the retention setting from saved or skipped cards.',
  timeoutSeconds: 300,
  handler,
  cronTriggerSettings: { pattern: '17 3 * * *' },
});
