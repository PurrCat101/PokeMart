-- KYC tiers: level 0 (not verified) buys nothing, level 1 buys ordinary listings, level 2 also buys the Master tier.
-- Listings that used to need level 0 or 1 now need 1; listings that needed 2 stay at 2.
UPDATE shop_listing SET required_kyc_level = 1;
UPDATE item_listing SET required_kyc_level = GREATEST(required_kyc_level, 1);
