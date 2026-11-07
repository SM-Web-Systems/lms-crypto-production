export const paystackCheckoutTable = 'paystack_checkout_links';
export const paystackCheckoutSchema = `CREATE TABLE IF NOT EXISTS paystack_checkout_links (
  payment_id TEXT PRIMARY KEY NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  authorization_url TEXT NOT NULL
);`;
