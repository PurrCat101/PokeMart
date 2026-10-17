import { newPurchaseId } from '../../support/utils/purchaseId';

export const preparePurchaseIntent = () => ({
  body: { purchaseId: newPurchaseId(), pokemonId: 1, quantity: 1 },
});
