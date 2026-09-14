CREATE TABLE signup_invoices (
    invoice_id text PRIMARY KEY,
    brand_id text NOT NULL REFERENCES brands(brand_id),
    period date NOT NULL,
    quantity integer NOT NULL CHECK(quantity > 0),
    amount integer NOT NULL CHECK(amount = quantity * 5000),
    status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','processing','paid','review')),
    tid text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz,
    UNIQUE(brand_id,period)
);
ALTER TABLE signup_usage ADD COLUMN invoice_id text REFERENCES signup_invoices(invoice_id);
