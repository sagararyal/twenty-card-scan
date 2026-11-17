import { defineCommandMenuItem, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { SCAN_CARDS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/scan-cards.front-component';

// Pinned on People, where scanned cards end up. A second item pins it on Scanned cards.
export default defineCommandMenuItem({
  universalIdentifier: '2e393809-6121-4d9d-8ec8-8f29b121561e',
  label: 'Scan business cards',
  shortLabel: 'Scan cards',
  icon: 'IconCamera',
  isPinned: true,
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  frontComponentUniversalIdentifier: SCAN_CARDS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
