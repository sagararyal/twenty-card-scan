import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { SCANNED_CARD_UNIVERSAL_IDENTIFIER } from 'src/objects/scanned-card.object';

export default defineNavigationMenuItem({
  universalIdentifier: '15d4c0d6-d6c9-4239-ac1b-249da5d94272',
  name: 'Scanned cards',
  icon: 'IconId',
  position: 10,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: SCANNED_CARD_UNIVERSAL_IDENTIFIER,
});
