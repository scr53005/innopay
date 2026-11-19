// One normalized row of a customer's account history (HUB-USER-FEATURES-PLAN §3).
//
// This type is the SEAM toward the CRM / data warehouse (CRM-PLAN.md). Today /user/history
// builds these rows live from Hive-Engine's history API. Later, the warehouse ingester (a forward
// HAFSQL scan + a check that Hive-Engine executed each transfer + hub order_payer) produces the
// SAME rows into a fact table, and /user/history switches its source with no UI change.
// Keep this file free of imports so it can move to `innocrm` unchanged.

export type MovementKind =
  | 'topup' //          @innopay → customer: card top-up, or the first credit at account creation
  | 'change' //         @innopay → customer: change returned after a card-paid order (Flow 7)
  | 'order' //          customer → @innopay or → shop: paying an order
  | 'rubis_earned' //   @innopay → customer: RUBIS for an order
  | 'rubis_spent' //    customer → shop: RUBIS applied to a bill
  | 'photo_reward' //   shop → customer: the owner published the customer's photo/video
  | 'message' //        customer → shop: a message (HUB-USER-FEATURES-PLAN §4, memo `m1:`)
  | 'message_reward' // shop → customer: the owner liked that message (memo `msg-reward:`)
  | 'transfer_in' //    anything else received
  | 'transfer_out'; //  anything else sent

export interface MovementShop {
  /** spoke.id when known; absent when only the name is known (e.g. from a RUBIS memo). */
  id?: string;
  name: string;
}

export interface AccountMovement {
  account: string;
  /** ISO 8601, UTC. */
  at: string;
  kind: MovementKind;
  /** Hive-Engine token: 'EURO' | 'LEI' | 'RUBIS'. */
  symbol: string;
  /** Signed: positive = received, negative = sent. */
  amount: number;
  /** The other Hive account of the transfer. */
  counterparty: string;
  shop?: MovementShop;
  /** The order reference ('kcs-inno-ab12-cd34') for orders and RUBIS spent at an order. */
  ref?: string;
  source: 'hive-engine';
  tx_id: string;
}
