import { defineCommandMenuItem } from 'twenty-sdk/define';

import { REVIEW_CARD_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/review-card.front-component';
import { SCANNED_CARD_UNIVERSAL_IDENTIFIER } from 'src/objects/scanned-card.object';

export default defineCommandMenuItem({
  universalIdentifier: '5270aac9-ab52-40d0-ba70-907bdc2435a1',
  label: 'Review card',
  shortLabel: 'Review',
  icon: 'IconChecklist',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: SCANNED_CARD_UNIVERSAL_IDENTIFIER,
  frontComponentUniversalIdentifier: REVIEW_CARD_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
