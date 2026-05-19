# Futbol '99 Rules

Futbol '99 is a two-player tactical soccer card game prototype. The current HTML version is mainly a playtest tool for the physical-card-game rules.

## Core Idea

Each team uses a fixed 12-card deck to command players by lane and field third.

The pitch is divided two ways:

- LCR lanes: Left, Center, Right
- AMD thirds: Attacking, Midfield, Defensive

Most cards command one LCR lane and show three action sections: A, M, and D. The section a player uses depends on which third that player is standing in when the card resolves.

## Starting Deck

Each team starts with these 12 cards:

- L1, L2, L3
- C1, C2, C3
- R1, R2, R3
- A 1/1/1
- D 1/1/1
- L+R 1/1

Lane cards activate players in that lane. The number is how many players may be activated.

Example: `L2` activates up to 2 players in the Left lane.

The `A 1/1/1` card activates 1 player in each lane, but only in the attacking third.

The `D 1/1/1` card activates 1 player in each lane, but only in the defensive third.

The `L+R 1/1` card activates 1 player in Left and 1 player in Right.

## Starting Card Reference

### L1 / R1

Activate up to 1 player in that flank lane.

- A: cross, pass lane, pass inside
- M: mark 2, pass lane, pass inside
- D: mark 2, tackle, pass lane, pass inside

### L2 / R2

Activate up to 2 players in that flank lane.

- A: cross, pass inside
- M: mark 2, pass lane, pass inside
- D: mark 2, pass lane

### L3 / R3

Activate up to 3 players in that flank lane.

- A: cross
- M: pass lane, mark 2
- D: mark 2

### C1

Activate up to 1 player in the Center lane.

- A: shoot, header, pass lane, pass outside
- M: mark 3, pass lane, pass outside
- D: mark 2, tackle, pass lane, pass outside

### C2

Activate up to 2 players in the Center lane.

- A: shoot, pass outside
- M: mark 2, pass lane, pass outside
- D: mark 2, pass lane, pass outside

### C3

Activate up to 3 players in the Center lane.

- A: shoot
- M: pass lane, mark 2
- D: mark 2

### A 1/1/1

Activate 1 player in each lane, but only in the attacking third.

- A: pass inside, shoot, mark 2

### D 1/1/1

Activate 1 player in each lane, but only in the defensive third.

- D: mark 2, header, pass lane, pass inside, pass outside

### L+R 1/1

Activate 1 player in Left and 1 player in Right.

- A: cross, pass inside
- M: mark 2, pass lane, pass inside
- D: mark 2, pass lane

## Round Structure

1. The team with the ball is offense.
2. Offense secretly plans 3 cards.
3. Defense secretly plans 3 cards.
4. Offense reveals and resolves its first card.
5. Defense chooses one of its planned cards, reveals it, and resolves it.
6. Repeat until offense has resolved all 3 planned cards.
7. Both players draw back up to a 6-card hand.
8. Begin a new round with whoever has possession.

Offense cards resolve left to right in the order they were planned. Defense may choose its planned cards in any order.

## Resolving A Card

When a command card resolves:

1. Activate eligible players.
2. Move activated players.
3. Choose one activated player to take one action from the card.

Each activated player may move up to 5 movement.

Only one activated player takes an action, even if the card activated multiple players.

The acting player must still be in a lane covered by the card after movement.

Example: if `L2` activates two Left-lane players and one of them moves into Center, only the player still in Left may take the action.

## Movement

Players may move up to 5 movement when activated.

Marked hexes make movement harder:

- Leaving a marked hex costs 2 movement instead of 1.

This makes marking useful as pitch control, not just pass defense.

## Actions

Current action keywords:

- Mark 2 / Mark 3: choose that many adjacent hexes for the defender to cover.
- Tackle: attempt to steal the ball from an adjacent opposing ball carrier.
- Pass lane: pass to a teammate in the same lane.
- Pass inside: pass from an outside lane toward Center.
- Pass outside: pass from Center toward Left or Right.
- Cross: pass from a flank into Center in the attacking third.
- Shoot: shoot at one of the three goal hexes.
- Header: currently treated like a shot-style action in the prototype.

### Marks

Marks represent temporary defensive pressure on specific hexes.

When a player marks hexes, those hexes affect movement and shooting. They also create visible pressure for passing lanes.

Marks last for:

1. The card resolution when they are placed.
2. The next card resolution after that.

Then they expire.

If the marking defender is activated during the second resolution while that mark is active, the mark is removed immediately.

### Tackle

Tackle targets an adjacent opposing ball carrier.

Current prototype result:

- 50% chance to steal the ball.
- On success, the ball transfers to the tackling player's hex.
- On failure, the ball carrier keeps possession.

## Passing

Passes are zone-based, not range-based.

The target must be a teammate in the zone allowed by the action.

`Pass lane` can target a teammate in the same LCR lane and in the same or adjacent AMD third.

`Pass inside`, `Pass outside`, and `Cross` use their listed lane/third restrictions.

### Offside

A receiving player cannot be more than 1 row beyond the last defender toward the attacking goal.

Example: if the deepest defender is on row 4 from that defender's goal, the offense may pass to a player on row 3, but not beyond that.

If no defender is between the passer and receiver, the pass succeeds automatically.

If defenders are between them:

- Roll 1d6.
- The pass succeeds on 1 or better.
- Each defender between passer and receiver applies -2 to the roll.

Example: one defender between means roll 1d6 - 2. A roll of 3+ succeeds.

## Shooting

The shooter chooses one of the three goal hexes.

If the shot is unimpeded, it succeeds automatically.

If defenders are involved:

- Roll 1d6.
- The shot succeeds on 1 or better.
- Each defender between the shooter and chosen goal hex applies -2.
- Each player marking the shooter applies -1.

Example: one defender in the shot line and one marker on the shooter means roll 1d6 - 3. A roll of 4+ succeeds.

When a goal is scored, the prototype resets to a kickoff for the team that conceded. The exact physical-game handling of unresolved planned cards after a goal is still a design question.

## Kickoffs And Goal Kicks

Kickoffs require a free medium pass before normal play begins.

Goal kicks require a free long pass to a teammate before normal play begins.

After the restart pass is complete, the normal planning round begins.

## Current Prototype Notes

The HTML prototype represents hidden planning mechanically with visible planned-card rows for testing.

Action choice uses an action panel and pitch highlighting after selecting the acting player.

The market and card-buying system are paused while the fixed 12-card command deck is tested.

`printable-pitch.html` is a printable physical-playtest pitch file.

This ruleset is intentionally in flux. The current design goal is to test whether LCR lanes, AMD thirds, planned card resolution, marking, and zone-based passing create interesting soccer tactics.
