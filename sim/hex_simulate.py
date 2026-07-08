#!/usr/bin/env python3
"""First real-hex simulation harness for Futbol '99.

This keeps the simple starter-deck bot philosophy from ``simulate.py`` but moves
the board model onto the actual pitch geometry used by the browser prototype.
"""

from __future__ import annotations

import argparse
import csv
import random
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import hex_geometry as hg
from simulate import STARTER_CARDS, Card


@dataclass(frozen=True)
class HexConfig:
    movement_per_activation: int = 4
    ball_carrier_movement: int = 2
    shot_target_number: int = 4
    mark_duration: int = 2
    marked_exit_cost: int = 2
    mark_mode: str = "hex"
    player_mark_movement_tax: bool = True
    shooter_movement_allowance: int = 1
    offside_enabled: bool = True


@dataclass
class HexPlayer:
    team: str
    pid: int
    coord: hg.Coord
    has_ball: bool = False
    off_balance_until_step: int = 0

    def attack_x(self) -> int:
        return self.coord[0] if self.team == "player" else hg.FIELD_WIDTH - 1 - self.coord[0]

    def zones(self) -> hg.Zones:
        return hg.zones(self.coord, self.team)


@dataclass
class HexMark:
    team: str
    coord: hg.Coord
    created_step: int
    defender_id: int
    target_team: str | None = None
    target_id: int | None = None


@dataclass
class HexStats:
    shots: int = 0
    goals: int = 0
    passes_attempted: int = 0
    passes_completed: int = 0
    tackles_attempted: int = 0
    tackles_successful: int = 0
    marks_placed: int = 0
    dribbles: int = 0
    crosses: int = 0
    clears: int = 0
    turnovers: int = 0
    offside_violations: int = 0
    rounds_with_no_shot: int = 0
    movement_used: list[int] = field(default_factory=list)
    movement_budget_used: list[int] = field(default_factory=list)
    active_mark_samples: list[int] = field(default_factory=list)
    cards_played: Counter = field(default_factory=Counter)
    actions_selected: Counter = field(default_factory=Counter)
    pass_intents_attempted: Counter = field(default_factory=Counter)
    pass_intents_completed: Counter = field(default_factory=Counter)
    no_effect_cards: Counter = field(default_factory=Counter)
    no_eligible_cards: Counter = field(default_factory=Counter)


class HexMatch:
    def __init__(self, cfg: HexConfig, rng: random.Random):
        self.cfg = cfg
        self.rng = rng
        self.step = 0
        self.possession = "player"
        self.players = self.starting_players("player")
        self.marks: list[HexMark] = []
        self.stats = HexStats()
        self.hands = {
            "player": self.draw_hand(),
            "ai": self.draw_hand(),
        }
        self.moved_this_card: dict[tuple[str, int], int] = {}

    def draw_hand(self) -> list[Card]:
        deck = list(STARTER_CARDS)
        self.rng.shuffle(deck)
        return deck[:6]

    def starting_players(self, kickoff_team: str) -> list[HexPlayer]:
        # Same rough footprint as the prototype: one kickoff player central,
        # four spread around, defenders in a spaced 2-3 shape.
        if kickoff_team == "player":
            blue = [(8, 6), (6, 3), (6, 9), (5, 5), (5, 7)]
            red = [(11, 3), (11, 9), (13, 2), (13, 6), (13, 10)]
        else:
            red = [(8, 6), (10, 3), (10, 9), (11, 5), (11, 7)]
            blue = [(5, 3), (5, 9), (3, 2), (3, 6), (3, 10)]
        players = [
            *(HexPlayer("player", i + 1, coord, kickoff_team == "player" and i == 0) for i, coord in enumerate(blue)),
            *(HexPlayer("ai", i + 1, coord, kickoff_team == "ai" and i == 0) for i, coord in enumerate(red)),
        ]
        return players

    def run(self) -> HexStats:
        for round_index in range(18):
            shots_before = self.stats.shots
            offense = self.possession
            defense = self.other(offense)
            offense_cards = self.plan_cards(offense, offense=True)
            defense_cards = self.plan_cards(defense, offense=False)
            for i in range(3):
                self.play_card(offense, offense_cards[i])
                if self.possession != offense:
                    offense, defense = self.possession, self.other(self.possession)
                self.play_card(defense, defense_cards[i])
                if self.possession != offense:
                    offense, defense = self.possession, self.other(self.possession)
                self.sample_state()
            if self.stats.shots == shots_before:
                self.stats.rounds_with_no_shot += 1
            self.expire_marks()
        return self.stats

    def plan_cards(self, team: str, offense: bool) -> list[Card]:
        hand = list(self.hands[team])
        carrier = self.ball_carrier()

        def card_score(card: Card) -> tuple[int, float]:
            eligible = self.eligible_players(team, card)
            if not eligible:
                return (-100, self.rng.random())
            actions = [a for p in eligible for a in self.actions_for(card, p)]
            score = len(eligible)
            if offense and carrier and carrier.team == team:
                if any("shoot" == a for a in actions):
                    score += 4
                if any("cross" == a for a in actions):
                    score += 2
            if not offense:
                if any(a.startswith("mark") for a in actions):
                    score += 3
                if "tackle" in actions:
                    score += 2
            return (score, self.rng.random())

        hand.sort(key=card_score, reverse=True)
        selected = hand[:3]
        while len(selected) < 3:
            selected.append(self.rng.choice(STARTER_CARDS))
        return selected

    def play_card(self, team: str, card: Card) -> None:
        self.step += 1
        self.moved_this_card = {}
        self.stats.cards_played[card.name] += 1
        activated = self.choose_activations(team, card)
        if not activated:
            self.stats.no_eligible_cards[card.name] += 1
            return

        for player in activated:
            self.clear_marks_by_activated_defender(player)
            spaces, budget = self.move_player(player)
            if spaces:
                self.moved_this_card[(player.team, player.pid)] = spaces
            self.stats.movement_used.append(spaces)
            self.stats.movement_budget_used.append(budget)

        self.try_free_pass(team)

        actor = self.choose_actor(team, card, activated)
        action = self.choose_action(team, card, actor) if actor else None
        if not actor or not action:
            self.stats.no_effect_cards[card.name] += 1
            return
        self.stats.actions_selected[action] += 1
        if not self.execute_action(team, actor, action):
            self.stats.no_effect_cards[card.name] += 1

    def eligible_players(self, team: str, card: Card) -> list[HexPlayer]:
        eligible: list[HexPlayer] = []
        for player in self.team_players(team):
            z = player.zones()
            if card.mode in {"lane", "split-lane"} and not any(lane in card.lanes for lane in z.lanes):
                continue
            if card.mode == "third" and z.third != card.third:
                continue
            eligible.append(player)
        return eligible

    def choose_activations(self, team: str, card: Card) -> list[HexPlayer]:
        eligible = self.eligible_players(team, card)
        selected: list[HexPlayer] = []
        if card.mode == "lane":
            main = [p for p in eligible if any(lane in card.lanes for lane in p.zones().lanes)]
            main.sort(key=lambda p: (p.has_ball, p.attack_x(), self.rng.random()), reverse=True)
            selected.extend(main[:card.count])
            if card.support_count:
                used = {p.pid for p in selected}
                support = [
                    p for p in self.team_players(team)
                    if p.pid not in used and any(lane in card.support_lanes for lane in p.zones().lanes)
                ]
                support.sort(key=lambda p: (p.has_ball, p.attack_x(), self.rng.random()), reverse=True)
                selected.extend(support[:card.support_count])
            return selected

        for lane in card.lanes:
            lane_players = [p for p in eligible if lane in p.zones().lanes]
            lane_players.sort(key=lambda p: (p.has_ball, p.attack_x(), self.rng.random()), reverse=True)
            selected.extend(lane_players[:card.per_lane])
        unique: list[HexPlayer] = []
        seen: set[tuple[str, int]] = set()
        for player in selected:
            key = (player.team, player.pid)
            if key not in seen:
                unique.append(player)
                seen.add(key)
        return unique

    def move_player(self, player: HexPlayer) -> tuple[int, int]:
        budget = self.cfg.ball_carrier_movement if player.has_ball else self.cfg.movement_per_activation
        occupied = {p.coord for p in self.players if p is not player}

        def exit_cost(coord: hg.Coord) -> int:
            if self.is_marked_coord(coord, self.other(player.team)):
                return self.cfg.marked_exit_cost
            if self.cfg.mark_mode == "player" and self.player_mark_count(player, self.other(player.team)):
                return self.cfg.marked_exit_cost if self.cfg.player_mark_movement_tax else 1
            return 1

        reachable = hg.reachable(player.coord, budget, occupied, exit_cost)
        target = self.choose_move_target(player, reachable)
        old = player.coord
        player.coord = target
        self.sync_player_marks(player, old, target)
        return hg.distance(old, target), reachable[target]

    def choose_move_target(self, player: HexPlayer, reachable: dict[hg.Coord, int]) -> hg.Coord:
        carrier = self.ball_carrier()
        direction = hg.attacking_direction(player.team)
        candidates = list(reachable)
        if player.has_ball:
            # Preserve shot eligibility when already in/near danger; otherwise advance.
            if player.attack_x() >= 10:
                one_step = [c for c in candidates if hg.distance(player.coord, c) <= self.cfg.shooter_movement_allowance]
                candidates = one_step or candidates
            return max(candidates, key=lambda c: (self.attack_x(player.team, c), "center" in hg.zones(c, player.team).lanes, -abs(c[1] - 6), self.rng.random()))
        if carrier and carrier.team == player.team:
            legal_pass_spots = [c for c in candidates if hg.standard_pass_allowed(carrier.coord, c, player.team)]
            candidates = legal_pass_spots or candidates
            return max(candidates, key=lambda c: (self.attack_x(player.team, c), "center" in hg.zones(c, player.team).lanes, -hg.distance(carrier.coord, c), self.rng.random()))
        if carrier:
            return min(candidates, key=lambda c: (hg.distance(c, carrier.coord), -self.attack_x(player.team, c), self.rng.random()))
        return max(candidates, key=lambda c: (direction * c[0], self.rng.random()))

    def choose_actor(self, team: str, card: Card, activated: list[HexPlayer]) -> HexPlayer | None:
        candidates = [p for p in activated if self.actions_for(card, p)]
        if not candidates:
            return None
        carrier = self.ball_carrier()
        if carrier and carrier.team == team and carrier in candidates:
            return carrier
        if carrier and carrier.team != team:
            return min(candidates, key=lambda p: (hg.distance(p.coord, carrier.coord), -p.attack_x(), self.rng.random()))
        return max(candidates, key=lambda p: (p.attack_x(), "center" in p.zones().lanes, self.rng.random()))

    def actions_for(self, card: Card, player: HexPlayer) -> tuple[str, ...]:
        actions = card.actions.get(player.zones().third, ())
        if self.moved_this_card.get((player.team, player.pid), 0) > self.cfg.shooter_movement_allowance:
            actions = tuple(a for a in actions if a not in {"shoot", "header"})
        return actions

    def choose_action(self, team: str, card: Card, actor: HexPlayer | None) -> str | None:
        if not actor:
            return None
        actions = self.actions_for(card, actor)
        carrier = self.ball_carrier()
        if actor.has_ball:
            if "shoot" in actions and actor.attack_x() >= 11 and self.shot_required(actor) <= 5:
                return "shoot"
            if "cross" in actions and "center" not in actor.zones().lanes and actor.zones().third == "attacking":
                return "cross"
        if carrier and carrier.team != team and "tackle" in actions and hg.distance(actor.coord, carrier.coord) <= 1:
            return "tackle"
        if any(a.startswith("mark") for a in actions):
            return next(a for a in actions if a.startswith("mark"))
        if "dribble" in actions and actor.has_ball and self.is_marked_coord(actor.coord, self.other(team)):
            return "dribble"
        if "clear" in actions and actor.has_ball:
            return "clear"
        return None

    def execute_action(self, team: str, actor: HexPlayer, action: str) -> bool:
        if action.startswith("mark"):
            self.place_mark(team, actor, int(action.split()[1]))
            return True
        if action == "tackle":
            return self.tackle(team, actor)
        if action == "shoot":
            return self.shoot(team, actor)
        if action == "cross":
            self.stats.crosses += 1
            return self.try_free_pass(team, prefer_center=True)
        if action == "dribble":
            return self.dribble(team, actor)
        if action == "clear":
            self.stats.clears += 1
            return self.clear(team, actor)
        return False

    def try_free_pass(self, team: str, prefer_center: bool = False) -> bool:
        actor = self.ball_carrier()
        if not actor or actor.team != team:
            return False
        targets = [
            p for p in self.team_players(team)
            if p is not actor and hg.standard_pass_allowed(actor.coord, p.coord, team) and self.is_onside(actor, p)
        ]
        if prefer_center:
            targets = [p for p in targets if "center" in p.zones().lanes] or targets
        if not targets:
            return False
        targets.sort(key=lambda p: (p.attack_x(), "center" in p.zones().lanes, -self.pass_modifier(actor, p), self.rng.random()), reverse=True)
        return self.pass_ball(actor, targets[0])

    def pass_ball(self, actor: HexPlayer, target: HexPlayer) -> bool:
        self.stats.passes_attempted += 1
        intent = self.classify_pass_intent(actor, target)
        self.stats.pass_intents_attempted[intent] += 1
        modifier = self.pass_modifier(actor, target)
        if self.roll(1 + modifier):
            actor.has_ball = False
            target.has_ball = True
            self.possession = actor.team
            self.stats.passes_completed += 1
            self.stats.pass_intents_completed[intent] += 1
            return True
        self.resolve_failed_pass(actor, target)
        return False

    def classify_pass_intent(self, actor: HexPlayer, target: HexPlayer) -> str:
        modifier = self.pass_modifier(actor, target)
        target_third = target.zones().third
        actor_third = actor.zones().third
        progressive = target.attack_x() > actor.attack_x()
        central_gain = "center" in target.zones().lanes and "center" not in actor.zones().lanes
        chance_creation = target_third == "attacking" and (
            "center" in target.zones().lanes
            or target.attack_x() >= 12
            or self.shot_required(target) <= 5
        )
        if modifier > 0 and (chance_creation or progressive or central_gain):
            return "risky_forced"
        if chance_creation:
            return "chance_creation"
        if progressive or central_gain or hg.THIRDS.index(target_third) > hg.THIRDS.index(actor_third):
            return "progressive"
        return "reset"

    def pass_modifier(self, actor: HexPlayer, target: HexPlayer) -> int:
        defending = self.other(actor.team)
        line = hg.hex_line(actor.coord, target.coord)
        occupied_blocks = sum(1 for p in self.team_players(defending) if p.coord in line)
        if self.cfg.mark_mode == "player":
            return occupied_blocks + self.player_mark_count(actor, defending) + self.player_mark_count(target, defending)
        mark_blocks = sum(1 for m in self.marks if m.team == defending and m.coord in line)
        return (occupied_blocks + mark_blocks) * 2

    def resolve_failed_pass(self, actor: HexPlayer, target: HexPlayer) -> None:
        defending = self.other(actor.team)
        line = hg.hex_line(actor.coord, target.coord)
        blockers = [p for p in self.team_players(defending) if p.coord in line]
        actor.has_ball = False
        target.has_ball = False
        if blockers:
            blocker = min(blockers, key=lambda p: hg.distance(actor.coord, p.coord))
            blocker.has_ball = True
            self.possession = defending
            self.stats.turnovers += 1
            return
        # Deflection to marked cell or target if no occupied blocker exists.
        target.has_ball = True
        self.possession = target.team

    def shoot(self, team: str, actor: HexPlayer) -> bool:
        if not actor.has_ball:
            return False
        self.stats.shots += 1
        required = self.shot_required(actor)
        if self.roll(required):
            self.stats.goals += 1
            self.reset_after_goal(self.other(team))
        return True

    def shot_required(self, actor: HexPlayer) -> int:
        goal = hg.default_goal_cell(actor.team)
        defending = self.other(actor.team)
        line = hg.hex_line(actor.coord, goal)
        occupied_blocks = sum(1 for p in self.team_players(defending) if p.coord in line)
        mark_blocks = self.player_mark_count(actor, defending) if self.cfg.mark_mode == "player" else sum(1 for m in self.marks if m.team == defending and m.coord in line)
        wide = 0 if "center" in actor.zones().lanes else 1
        return self.cfg.shot_target_number + occupied_blocks + mark_blocks + wide

    def place_mark(self, team: str, actor: HexPlayer, count: int) -> None:
        if self.cfg.mark_mode == "player":
            targets = [p for p in self.team_players(self.other(team)) if hg.distance(actor.coord, p.coord) <= 1 and not self.player_mark_count(p, team)]
            if not targets:
                return
            target = max(targets, key=lambda p: (p.has_ball, p.attack_x(), self.rng.random()))
            self.marks.append(HexMark(team, target.coord, self.step, actor.pid, target.team, target.pid))
            self.stats.marks_placed += 1
            return

        candidates = [c for c in hg.neighbors(actor.coord) if c not in {p.coord for p in self.players}]
        candidates.sort(key=lambda c: (self.attack_x(self.other(team), c), -abs(c[1] - 6), self.rng.random()), reverse=True)
        for coord in candidates[:count]:
            self.marks.append(HexMark(team, coord, self.step, actor.pid))
            self.stats.marks_placed += 1

    def tackle(self, team: str, actor: HexPlayer) -> bool:
        carrier = self.ball_carrier()
        if not carrier or carrier.team == team or hg.distance(actor.coord, carrier.coord) > 1:
            return False
        self.stats.tackles_attempted += 1
        required = 4 + self.player_mark_count(actor, self.other(team))
        if self.roll(required):
            carrier.has_ball = False
            actor.has_ball = True
            self.possession = team
            self.stats.tackles_successful += 1
            self.stats.turnovers += 1
            return True
        return False

    def dribble(self, team: str, actor: HexPlayer) -> bool:
        if self.cfg.mark_mode == "player":
            before = len(self.marks)
            self.marks = [m for m in self.marks if not (m.team == self.other(team) and m.target_team == actor.team and m.target_id == actor.pid)]
            if len(self.marks) < before:
                self.stats.dribbles += 1
                return True
            return False
        for idx, mark in enumerate(self.marks):
            if mark.team == self.other(team) and hg.distance(actor.coord, mark.coord) <= 1:
                del self.marks[idx]
                self.stats.dribbles += 1
                return True
        return False

    def clear(self, team: str, actor: HexPlayer) -> bool:
        if not actor.has_ball:
            return False
        candidates = [c for c in hg.all_cells() if 3 <= self.forward_distance(team, actor.coord, c) <= 5 and abs(c[1] - actor.coord[1]) <= 3]
        if not candidates:
            return False
        target = max(candidates, key=lambda c: (self.attack_x(team, c), -abs(c[1] - 6), self.rng.random()))
        actor.has_ball = False
        receiver = self.player_at(target)
        if receiver:
            receiver.has_ball = True
            self.possession = receiver.team
        else:
            self.possession = self.other(team)
            nearest = min(self.team_players(self.possession), key=lambda p: hg.distance(p.coord, target))
            nearest.has_ball = True
            self.stats.turnovers += 1
        return True

    def is_onside(self, passer: HexPlayer, target: HexPlayer) -> bool:
        if not self.cfg.offside_enabled:
            return True
        # Only matters when receiving in the opposing half.
        if target.attack_x() <= 8:
            return True
        defenders = self.team_players(self.other(passer.team))
        if not defenders:
            return True
        last_defender_attack_x = max(self.attack_x(passer.team, d.coord) for d in defenders)
        passer_attack_x = passer.attack_x()
        target_attack_x = target.attack_x()
        if passer_attack_x > last_defender_attack_x:
            return target_attack_x <= passer_attack_x
        ok = target_attack_x <= last_defender_attack_x + 1
        if not ok:
            self.stats.offside_violations += 1
        return ok

    def sync_player_marks(self, player: HexPlayer, old: hg.Coord, new: hg.Coord) -> None:
        if self.cfg.mark_mode != "player" or old == new:
            return
        occupied = {p.coord for p in self.players if p is not player}
        next_marks: list[HexMark] = []
        for mark in self.marks:
            if mark.target_team != player.team or mark.target_id != player.pid:
                next_marks.append(mark)
                continue
            marker = self.find_player(mark.team, mark.defender_id)
            if not marker:
                continue
            if hg.distance(marker.coord, new) <= 1:
                mark.coord = new
                next_marks.append(mark)
                continue
            follow_options = [c for c in hg.neighbors(marker.coord) if c not in occupied and hg.distance(c, new) <= 1]
            if follow_options:
                marker.coord = min(follow_options, key=lambda c: (hg.distance(c, new), hg.distance(c, old), self.rng.random()))
                mark.coord = new
                next_marks.append(mark)
        self.marks = next_marks

    def clear_marks_by_activated_defender(self, player: HexPlayer) -> None:
        self.marks = [m for m in self.marks if not (m.team == player.team and m.defender_id == player.pid and self.step > m.created_step)]

    def expire_marks(self) -> None:
        self.marks = [m for m in self.marks if self.step <= m.created_step + self.cfg.mark_duration]

    def sample_state(self) -> None:
        self.stats.active_mark_samples.append(len(self.marks))

    def reset_after_goal(self, kickoff_team: str) -> None:
        self.players = self.starting_players(kickoff_team)
        self.possession = kickoff_team
        self.marks.clear()

    def player_mark_count(self, player: HexPlayer, marking_team: str) -> int:
        return sum(1 for m in self.marks if m.team == marking_team and m.target_team == player.team and m.target_id == player.pid)

    def is_marked_coord(self, coord: hg.Coord, marking_team: str) -> bool:
        return any(m.team == marking_team and m.target_team is None and m.coord == coord for m in self.marks)

    def player_at(self, coord: hg.Coord) -> HexPlayer | None:
        return next((p for p in self.players if p.coord == coord), None)

    def ball_carrier(self) -> HexPlayer | None:
        return next((p for p in self.players if p.has_ball), None)

    def team_players(self, team: str) -> list[HexPlayer]:
        return [p for p in self.players if p.team == team]

    def find_player(self, team: str, pid: int) -> HexPlayer | None:
        return next((p for p in self.players if p.team == team and p.pid == pid), None)

    def other(self, team: str) -> str:
        return "ai" if team == "player" else "player"

    def attack_x(self, team: str, coord: hg.Coord) -> int:
        return coord[0] if team == "player" else hg.FIELD_WIDTH - 1 - coord[0]

    def forward_distance(self, team: str, start: hg.Coord, end: hg.Coord) -> int:
        return (end[0] - start[0]) * hg.attacking_direction(team)

    def roll(self, required: int) -> bool:
        if required <= 1:
            return True
        if required > 6:
            return False
        return self.rng.randint(1, 6) >= required


def aggregate(results: list[HexStats], cfg: HexConfig, seed: int) -> dict[str, float | str | int | bool | Counter]:
    n = len(results)
    total = HexStats()
    for result in results:
        for name in (
            "shots", "goals", "passes_attempted", "passes_completed", "tackles_attempted",
            "tackles_successful", "marks_placed", "dribbles", "crosses", "clears",
            "turnovers", "offside_violations", "rounds_with_no_shot",
        ):
            setattr(total, name, getattr(total, name) + getattr(result, name))
        total.movement_used.extend(result.movement_used)
        total.movement_budget_used.extend(result.movement_budget_used)
        total.active_mark_samples.extend(result.active_mark_samples)
        total.cards_played.update(result.cards_played)
        total.actions_selected.update(result.actions_selected)
        total.pass_intents_attempted.update(result.pass_intents_attempted)
        total.pass_intents_completed.update(result.pass_intents_completed)
        total.no_effect_cards.update(result.no_effect_cards)
        total.no_eligible_cards.update(result.no_eligible_cards)

    pass_intent_summary = {}
    for intent in ("reset", "progressive", "chance_creation", "risky_forced"):
        attempted = total.pass_intents_attempted[intent]
        completed = total.pass_intents_completed[intent]
        pass_intent_summary[f"{intent}_passes_per_match"] = attempted / n
        pass_intent_summary[f"{intent}_completion_rate"] = completed / attempted if attempted else 0

    return {
        "seed": seed,
        "matches": n,
        "movement_per_activation": cfg.movement_per_activation,
        "ball_carrier_movement": cfg.ball_carrier_movement,
        "shot_target_number": cfg.shot_target_number,
        "mark_mode": cfg.mark_mode,
        "mark_duration": cfg.mark_duration,
        "player_mark_movement_tax": cfg.player_mark_movement_tax,
        "shots_per_match": total.shots / n,
        "goals_per_match": total.goals / n,
        "passes_attempted_per_match": total.passes_attempted / n,
        "pass_completion_rate": total.passes_completed / total.passes_attempted if total.passes_attempted else 0,
        **pass_intent_summary,
        "tackles_attempted_per_match": total.tackles_attempted / n,
        "tackles_success_rate": total.tackles_successful / total.tackles_attempted if total.tackles_attempted else 0,
        "marks_placed_per_match": total.marks_placed / n,
        "average_marks_active": sum(total.active_mark_samples) / len(total.active_mark_samples) if total.active_mark_samples else 0,
        "dribbles_per_match": total.dribbles / n,
        "crosses_per_match": total.crosses / n,
        "clears_per_match": total.clears / n,
        "turnovers_per_match": total.turnovers / n,
        "offside_violations_per_match": total.offside_violations / n,
        "rounds_with_no_shot_per_match": total.rounds_with_no_shot / n,
        "average_movement_used": sum(total.movement_used) / len(total.movement_used) if total.movement_used else 0,
        "average_movement_budget_used": sum(total.movement_budget_used) / len(total.movement_budget_used) if total.movement_budget_used else 0,
        "_cards_played": total.cards_played,
        "_actions_selected": total.actions_selected,
        "_pass_intents_attempted": total.pass_intents_attempted,
        "_pass_intents_completed": total.pass_intents_completed,
        "_no_effect_cards": total.no_effect_cards,
        "_no_eligible_cards": total.no_eligible_cards,
    }


def write_csv(path: Path, summary: dict[str, float | str | int | bool | Counter]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    scalar_keys = [key for key in summary if not key.startswith("_")]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["metric", "value"])
        for key in scalar_keys:
            value = summary[key]
            writer.writerow([key, f"{value:.4f}" if isinstance(value, float) else value])
        writer.writerow([])
        writer.writerow(["actions_selected", "count"])
        for key, value in summary["_actions_selected"].most_common():
            writer.writerow([key, value])
        writer.writerow([])
        writer.writerow(["pass_intent", "attempted", "completed", "completion_rate"])
        for intent in ("reset", "progressive", "chance_creation", "risky_forced"):
            attempted = summary["_pass_intents_attempted"][intent]
            completed = summary["_pass_intents_completed"][intent]
            rate = completed / attempted if attempted else 0
            writer.writerow([intent, attempted, completed, f"{rate:.4f}"])


def print_summary(summary: dict[str, float | str | int | bool | Counter]) -> None:
    print("Futbol '99 real-hex simulation")
    print("=" * 31)
    for key in [
        "matches", "mark_mode", "movement_per_activation", "ball_carrier_movement",
        "shot_target_number", "shots_per_match", "goals_per_match",
        "passes_attempted_per_match", "pass_completion_rate", "marks_placed_per_match",
        "reset_passes_per_match", "reset_completion_rate",
        "progressive_passes_per_match", "progressive_completion_rate",
        "chance_creation_passes_per_match", "chance_creation_completion_rate",
        "risky_forced_passes_per_match", "risky_forced_completion_rate",
        "average_marks_active", "dribbles_per_match", "crosses_per_match",
        "tackles_attempted_per_match", "turnovers_per_match", "rounds_with_no_shot_per_match",
        "average_movement_used", "average_movement_budget_used",
    ]:
        value = summary[key]
        print(f"{key}: {value:.3f}" if isinstance(value, float) else f"{key}: {value}")
    print("\nActions:")
    for action, count in summary["_actions_selected"].most_common():
        print(f"- {action}: {count}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the first real-hex Futbol '99 starter-deck sim.")
    parser.add_argument("--matches", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=9901)
    parser.add_argument("--output", type=Path, default=Path("sim/results/hex_real_summary.csv"))
    parser.add_argument("--mark-mode", choices=("hex", "player"), default="hex")
    parser.add_argument("--mark-duration", type=int, default=2)
    parser.add_argument("--player-mark-movement-tax", choices=("on", "off"), default="on")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = HexConfig(
        mark_mode=args.mark_mode,
        mark_duration=args.mark_duration,
        player_mark_movement_tax=args.player_mark_movement_tax == "on",
    )
    rng = random.Random(args.seed)
    results = [HexMatch(cfg, rng).run() for _ in range(args.matches)]
    summary = aggregate(results, cfg, args.seed)
    write_csv(args.output, summary)
    print_summary(summary)
    print(f"\nSummary written to {args.output}")


if __name__ == "__main__":
    main()
