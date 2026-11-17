import { defineCommandMenuItem } from 'twenty-sdk/define';

import { SCAN_CARDS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/scan-cards.front-component';
import { SCANNED_CARD_UNIVERSAL_IDENTIFIER } from 'src/objects/scanned-card.object';

export default defineCommandMenuItem({
  universalIdentifier: 'bdd5be0c-c0ca-4f15-9809-6b9e5157a736',
  label: 'Scan business cards',
  shortLabel: 'Scan cards',
  icon: 'IconCamera',
  isPinned: true,
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier: SCANNED_CARD_UNIVERSAL_IDENTIFIER,
  frontComponentUniversalIdentifier: SCAN_CARDS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
