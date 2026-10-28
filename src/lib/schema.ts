import type { TargetField } from "./types";

export const TARGET_SCHEMA: TargetField[] = [
  {
    name: "customer_id",
    type: "string",
    required: true,
    description: "Stable identifier for the customer",
    synonyms: ["customer id", "cust id", "cust no", "customer number", "buyer id", "client id"],
  },
  {
    name: "customer_name",
    type: "string",
    required: false,
    description: "Customer or buyer display name",
    synonyms: ["customer name", "buyer name", "client name", "full name", "name"],
  },
  {
    name: "email",
    type: "string",
    required: false,
    description: "Primary customer email address",
    synonyms: ["email", "email address", "mail", "buyer email"],
  },
  {
    name: "order_id",
    type: "string",
    required: true,
    description: "Stable identifier for an order",
    synonyms: ["order id", "order no", "transaction id", "txn id", "invoice id"],
  },
  {
    name: "order_total",
    type: "number",
    required: true,
    description: "Total monetary value of the order",
    synonyms: ["order total", "transaction amount", "txn amount", "net amount", "amount", "total"],
  },
  {
    name: "currency",
    type: "string",
    required: false,
    description: "ISO currency code",
    synonyms: ["currency", "currency code", "ccy"],
  },
  {
    name: "order_date",
    type: "date",
    required: true,
    description: "Date on which the order was created",
    synonyms: ["order date", "transaction date", "txn day", "created at", "purchase date", "date"],
  },
  {
    name: "order_status",
    type: "string",
    required: false,
    description: "Current normalized order status",
    synonyms: ["order status", "status", "status code", "state"],
  },
];

export const DEMO_CSV = `cust_no,buyer_name,buyer_mail,txn_id,txn_amt,txn_day,curr,status_cd
C-1001,Asha Mehta,asha@example.com,T-9001,2499.50,2026-10-18,inr,paid
C-1002,Rohan Sen,rohan@example.com,T-9002,799.00,18/10/2026,INR,shipped
C-1003,Maya Shah,maya@example.com,T-9003,,2026-10-19,inr,pending
C-1004,Arjun Rao,arjun@example.com,T-9004,1599.25,2026-10-20,INR,paid
C-1004,Arjun Rao,arjun@example.com,T-9004,1599.25,2026-10-20,INR,paid`;
