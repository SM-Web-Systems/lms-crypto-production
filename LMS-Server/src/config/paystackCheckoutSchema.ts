export const paystackPaymentTables = ['paystack_checkout_links', 'paystack_refund_requests'];
export const paystackCheckoutSchema = `CREATE TABLE IF NOT EXISTS paystack_checkout_links (
  payment_id TEXT PRIMARY KEY NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  authorization_url TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paystack_refund_requests (
  payment_id TEXT PRIMARY KEY NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  refund_reference TEXT NOT NULL UNIQUE,
  submitted INTEGER NOT NULL DEFAULT 0 CHECK (submitted IN (0, 1))
);`;
