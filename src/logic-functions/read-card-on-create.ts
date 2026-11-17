import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordCreateEvent } from 'twenty-sdk/logic-function';

import { SCANNED_CARD_UNIVERSAL_IDENTIFIER } from 'src/objects/scanned-card.object';
import { readScannedCard } from 'src/utils/read-scanned-card';

// Bulk mode: every new Scanned card is read on the server right away, so the phone
// only has to upload. The person reviews later from the Scanned cards list.
const handler = async (event: DatabaseEventPayload<ObjectRecordCreateEvent>) => {
  const result = await readScannedCard(event.recordId, { fresh: true });

  return { recordId: event.recordId, success: result.success };
};

export default defineLogicFunction({
  universalIdentifier: 'deb23a56-2e04-49ce-8146-4ba1fa63794e',
  name: 'read-card-on-create',
  description: 'Reads a business card as soon as its Scanned card is created.',
  timeoutSeconds: 120,
  handler,
  eventTriggerSettings: {
    on: 'recordEvent',
    objectUniversalIdentifier: SCANNED_CARD_UNIVERSAL_IDENTIFIER,
    action: 'created',
  },
});
