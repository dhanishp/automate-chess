# Automate Classic Ruleset (working implementation spec)

This repo uses `automate_classic` as the default ruleset.

## Locked rules

- Budget: **35 points**
- White acts first during setup
- Setup is **visible** and **alternating**
- Mandatory pawns: **6 minimum** before king placement is allowed
- Costs:
  - Pawn: 1
  - Knight: 3
  - Bishop: 3
  - Rook: 4
  - Queen: 7
  - King: 0
- Pawns may only be placed on:
  - White: ranks 2 and 3
  - Black: ranks 6 and 7
- Non-king pieces may only be placed on:
  - White: ranks 1 and 2
  - Black: ranks 7 and 8
- Kings are placed after setup is complete for that player
- A player may complete setup when:
  - they have 0 points remaining, or
  - they explicitly choose to stop spending (`finish_setup`)
- King placement loses immediately if the king is in check on placement
- Standard draw rules are intended later during autoplay

## Current implementation assumptions

- Castling is disabled for v1 until the original behavior is verified
- Setup actions alternate globally; each turn is one of:
  - place one purchasable piece
  - finish spending
  - place king
- Once a player marks themselves finished, they cannot purchase more pieces
- The game becomes autoplay-ready after both kings are validly placed
