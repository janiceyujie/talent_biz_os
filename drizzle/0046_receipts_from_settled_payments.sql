-- Every settled payment becomes one receipt (decision 0021): its cash is the settled amount, or the
-- payment's full total where none was given (the total with tax, in whole yen for JPY), withheld 0,
-- on the day it was settled. One settled short stays short. Expected and cancelled payments get
-- none: only a settled payment has a settled day (payment_settled_check).
INSERT INTO payment_receipt (talent_id, payment_id, received_on, cash, withheld, created_at)
SELECT talent_id, id, settled_on,
  coalesce(
    settled_amount,
    CASE WHEN tax_included THEN amount
      ELSE amount + round(amount * tax_rate / 100, CASE WHEN currency = 'JPY' THEN 0 ELSE 2 END)
    END
  ),
  0, updated_at
FROM payment
WHERE status = 'settled';
