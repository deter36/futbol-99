#!/usr/bin/env python3
"""Monte Carlo simulator for the Futbol '99 starter-deck prototype.

This is intentionally a simplified rules harness, not a full clone of the
browser game. It models lanes, thirds, depth, card planning, movement, passing,
shooting, tackling, marks, clearances, airborne crosses/headers, off-balance,
and offside closely enough to spot obvious balance smells in the 12-card base
deck.
"""

from __future__ import annotations

import argparse
import csv
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from statistics import mean


LANES = ("left", "center", "right")
THIRDS = ("defensive", "midfield", "attacking")
DEPTH_MIN = 0
DEPTH_MAX = 16
ROUNDS_PER_MATCH = 18
HAND_SIZE = 6


@dataclass(frozen=True)
class Config:
    movement_per_activation: int = 4
    ball_carrier_movement: int = 2
    mark_duration: int = 2
    defender_pass_penalty: int = -2
    defender_shot_penalty: int = -1
    marker_shot_penalty: int = -1
    marked_hex_exit_cost: int = 2
    shot_target_number: int = 5
    shot_target_mode: str = "flat"
    center_shot_target_number: int = 4
    wide_shot_target_number: int = 5
    goalie_enabled: bool = False
    goalie_shot_penalty: int = 1
    offside_enabled: bool = True
    bot_style: str = "balanced"
    shooter_movement_allowance: int = 0
    flank_service_enabled: bool = False
    mark_mode: str = "hex"
    player_mark_movement_tax: bool = True


@dataclass(frozen=True)
class Card:
    name: str
    mode: str
    lanes: tuple[str, ...] = ()
    count: int = 0
    third: str | None = None
    per_lane: int = 0
    support_lanes: tuple[str, ...] = ()
    support_count: int = 0
    actions: dict[str, tuple[str, ...]] = field(default_factory=dict)


@dataclass
class Player:
    team: int
    pid: int
    lane: str
    depth: int
    has_ball: bool = False
    off_balance_until_step: int = 0

    def attack_depth(self) -> int:
        return self.depth if self.team == 0 else DEPTH_MAX - self.depth

    def third(self) -> str:
        depth = self.attack_depth()
        if depth <= 5:
            return "defensive"
        if depth <= 10:
            return "midfield"
        return "attacking"


@dataclass
class Mark:
    team: int
    lane: str
    depth: int
    created_step: int
    defender_id: int
    target_team: int | None = None
    target_id: int | None = None


@dataclass
class AirborneBall:
    team: int
    lane: str
    depth: int
    created_step: int


@dataclass
class TeamState:
    deck: list[Card]
    hand: list[Card] = field(default_factory=list)
    discard: list[Card] = field(default_factory=list)


@dataclass
class ShotEvent:
    match_id: int
    round_index: int
    step: int
    team: int
    role: str
    card: str
    action: str
    shooter_pid: int
    shooter_lane: str
    shooter_third: str
    shooter_depth: int
    shooter_attack_depth: int
    shooter_moved: int
    received_free_pass: bool
    free_pass_from_lane: str
    free_pass_from_third: str
    required_roll: int
    blockers: int
    markers: int
    goalie_modifier: int
    goal: bool


@dataclass
class MatchStats:
    shots: int = 0
    goals: int = 0
    passes_attempted: int = 0
    passes_completed: int = 0
    free_passes_attempted: int = 0
    free_passes_completed: int = 0
    action_passes_attempted: int = 0
    action_passes_completed: int = 0
    tackles_attempted: int = 0
    tackles_successful: int = 0
    marks_placed: int = 0
    active_mark_samples: list[int] = field(default_factory=list)
    offside_violations: int = 0
    rounds_with_no_shot: int = 0
    cards_played: Counter = field(default_factory=Counter)
    actions_selected: Counter = field(default_factory=Counter)
    meaningful_cards: Counter = field(default_factory=Counter)
    no_effect_cards: Counter = field(default_factory=Counter)
    no_eligible_activation: Counter = field(default_factory=Counter)
    activations: list[int] = field(default_factory=list)
    movement_used: list[int] = field(default_factory=list)
    movement_budget_used: list[int] = field(default_factory=list)
    turnovers: int = 0
    possession_depth_samples: list[int] = field(default_factory=list)
    crosses_attempted: int = 0
    headers_attempted: int = 0
    headers_scored: int = 0
    clears_attempted: int = 0
    clears_recovered: int = 0
    dribbles: int = 0
    off_balance_events: int = 0
    service_attempts: int = 0
    service_shots: int = 0
    service_goals: int = 0
    shot_events: list[ShotEvent] = field(default_factory=list)


STARTER_CARDS = [
    Card("L1", "lane", ("left",), 1, actions={
        "defensive": ("tackle", "clear"),
        "midfield": ("mark 2", "dribble"),
        "attacking": ("cross", "dribble"),
    }),
    Card("L2", "lane", ("left",), 2, actions={
        "defensive": ("mark 2", "clear"),
        "midfield": ("mark 2",),
        "attacking": ("cross",),
    }),
    Card("L3", "lane", ("left",), 2, support_lanes=("center",), support_count=1, actions={
        "defensive": ("mark 3",),
        "midfield": ("mark 2",),
        "attacking": ("cross", "shoot"),
    }),
    Card("C1", "lane", ("center",), 1, actions={
        "defensive": ("tackle", "clear", "header"),
        "midfield": ("dribble",),
        "attacking": ("shoot", "dribble", "header"),
    }),
    Card("C2", "lane", ("center",), 2, actions={
        "defensive": ("mark 2", "clear", "header"),
        "midfield": ("mark 2",),
        "attacking": ("shoot", "header"),
    }),
    Card("C3", "lane", ("center",), 2, support_lanes=("left", "right"), support_count=1, actions={
        "defensive": ("mark 3",),
        "midfield": ("mark 2",),
        "attacking": ("shoot",),
    }),
    Card("R1", "lane", ("right",), 1, actions={
        "defensive": ("tackle", "clear"),
        "midfield": ("mark 2", "dribble"),
        "attacking": ("cross", "dribble"),
    }),
    Card("R2", "lane", ("right",), 2, actions={
        "defensive": ("mark 2", "clear"),
        "midfield": ("mark 2",),
        "attacking": ("cross",),
    }),
    Card("R3", "lane", ("right",), 2, support_lanes=("center",), support_count=1, actions={
        "defensive": ("mark 3",),
        "midfield": ("mark 2",),
        "attacking": ("cross", "shoot"),
    }),
    Card("A 1/1/1", "third", ("left", "center", "right"), third="attacking", per_lane=1,
         actions={"attacking": ("shoot", "dribble", "header")}),
    Card("D 1/1/1", "third", ("left", "center", "right"), third="defensive", per_lane=1,
         actions={"defensive": ("mark 2", "clear")}),
    Card("L+R 1/1", "split-lane", ("left", "right"), per_lane=1, actions={
        "defensive": ("mark 2", "clear"),
        "midfield": ("dribble",),
        "attacking": ("cross",),
    }),
]


class Match:
    def __init__(self, cfg: Config, rng: random.Random, match_id: int = 0):
        self.cfg = cfg
        self.rng = rng
        self.match_id = match_id
        self.teams = [TeamState(deck=STARTER_CARDS.copy()), TeamState(deck=STARTER_CARDS.copy())]
        for team in self.teams:
            self.rng.shuffle(team.deck)
            self.draw_up(team)
        self.players = self.starting_players()
        self.marks: list[Mark] = []
        self.airborne: AirborneBall | None = None
        self.moved_this_card: dict[tuple[int, int], int] = {}
        self.current_round = 0
        self.current_role = ""
        self.current_card_name = ""
        self.last_free_pass: tuple[Player, Player] | None = None
        self.step = 0
        self.possession = 0
        self.stats = MatchStats()

    def attack_direction(self, team_id: int) -> int:
        return 1 if team_id == 0 else -1

    def starting_players(self) -> list[Player]:
        return [
            Player(0, 1, "center", 8, True),
            Player(0, 2, "left", 7),
            Player(0, 3, "right", 7),
            Player(0, 4, "left", 5),
            Player(0, 5, "right", 5),
            Player(1, 1, "center", 8),
            Player(1, 2, "left", 9),
            Player(1, 3, "right", 9),
            Player(1, 4, "left", 11),
            Player(1, 5, "right", 11),
        ]

    def draw_up(self, team: TeamState) -> None:
        while len(team.hand) < HAND_SIZE:
            if not team.deck:
                team.deck.extend(team.discard)
                team.discard.clear()
                self.rng.shuffle(team.deck)
            if not team.deck:
                return
            team.hand.append(team.deck.pop())

    def run(self) -> MatchStats:
        for round_index in range(1, ROUNDS_PER_MATCH + 1):
            self.current_round = round_index
            start_shots = self.stats.shots
            offense = self.possession
            defense = 1 - offense
            offense_plan = self.plan_cards(offense, role="offense")
            defense_plan = self.plan_cards(defense, role="defense")

            for card in offense_plan:
                self.resolve_card(offense, card, role="offense")
                if defense_plan:
                    dcard = self.choose_defense_card(defense_plan)
                    defense_plan.remove(dcard)
                    self.resolve_card(defense, dcard, role="defense")

            for card in defense_plan:
                self.teams[defense].discard.append(card)
            self.draw_up(self.teams[0])
            self.draw_up(self.teams[1])
            if self.stats.shots == start_shots:
                self.stats.rounds_with_no_shot += 1
            carrier = self.ball_carrier()
            if carrier:
                self.stats.possession_depth_samples.append(carrier.depth)
        return self.stats

    def plan_cards(self, team_id: int, role: str) -> list[Card]:
        hand = self.teams[team_id].hand
        scored = [(self.card_plan_score(team_id, card, role), self.rng.random(), card) for card in hand]
        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        chosen = [item[2] for item in scored[:3]]
        for card in chosen:
            hand.remove(card)
        return chosen

    def card_plan_score(self, team_id: int, card: Card, role: str) -> float:
        eligible = self.eligible_players(team_id, card)
        if not eligible:
            return -10
        score = len(eligible) * 0.7
        carrier = self.ball_carrier()
        if carrier and carrier.team == team_id:
            if any("shoot" in self.actions_for(card, p) for p in eligible):
                score += 4 * self.style_weight("shoot")
            if any(action == "cross" for p in eligible for action in self.actions_for(card, p)):
                score += 2 * self.style_weight("pass")
        else:
            if any("tackle" in self.actions_for(card, p) for p in eligible):
                score += 2
            if any(action.startswith("mark") for p in eligible for action in self.actions_for(card, p)):
                score += 1.5 * self.style_weight("mark")
        if role == "defense" and card.name.startswith("D"):
            score += 1
        return score

    def choose_defense_card(self, cards: list[Card]) -> Card:
        defense = 1 - self.possession
        return max(cards, key=lambda card: (self.card_plan_score(defense, card, "defense"), self.rng.random()))

    def resolve_card(self, team_id: int, card: Card, role: str) -> None:
        self.step += 1
        self.current_role = role
        self.current_card_name = card.name
        self.last_free_pass = None
        self.clear_team_off_balance(team_id)
        self.expire_marks()
        self.expire_airborne()
        self.stats.cards_played[card.name] += 1
        self.stats.active_mark_samples.append(len(self.marks))

        activated = self.choose_activations(team_id, card)
        if not activated:
            self.stats.no_eligible_activation[card.name] += 1
            self.teams[team_id].discard.append(card)
            return
        self.stats.activations.append(len(activated))
        self.moved_this_card = {}
        for player in activated:
            self.clear_player_marks_if_needed(player)
            spaces = self.move_player(player)
            if spaces > 0:
                self.moved_this_card[(player.team, player.pid)] = spaces

        free_pass = self.try_free_pass(team_id)
        self.last_free_pass = free_pass
        if self.cfg.flank_service_enabled and self.try_flank_service_shot(team_id, card, activated, free_pass):
            meaningful = True
            self.stats.meaningful_cards[card.name] += 1
            self.teams[team_id].discard.append(card)
            return

        acting = self.choose_actor(team_id, card, activated)
        meaningful = False
        if acting:
            action = self.choose_action(team_id, card, acting)
            if action:
                self.stats.actions_selected[action] += 1
                meaningful = self.execute_action(team_id, acting, action)

        if meaningful:
            self.stats.meaningful_cards[card.name] += 1
        else:
            self.stats.no_effect_cards[card.name] += 1
        self.teams[team_id].discard.append(card)

    def eligible_players(self, team_id: int, card: Card) -> list[Player]:
        result = []
        for player in self.team_players(team_id):
            if card.mode == "lane" and player.lane not in card.lanes:
                continue
            if card.mode == "split-lane" and player.lane not in card.lanes:
                continue
            if card.mode == "third" and player.third() != card.third:
                continue
            result.append(player)
        return result

    def choose_activations(self, team_id: int, card: Card) -> list[Player]:
        eligible = self.eligible_players(team_id, card)
        if card.mode == "lane":
            eligible.sort(key=lambda p: (p.has_ball, p.attack_depth(), self.rng.random()), reverse=True)
            selected = eligible[:card.count]
            if card.support_count:
                selected_ids = {p.pid for p in selected}
                support = [
                    p for p in self.team_players(team_id)
                    if p.pid not in selected_ids and p.lane in card.support_lanes
                ]
                support.sort(key=lambda p: (p.has_ball, p.attack_depth(), self.rng.random()), reverse=True)
                selected.extend(support[:card.support_count])
            return selected
        selected = []
        for lane in card.lanes:
            lane_players = [p for p in eligible if p.lane == lane]
            lane_players.sort(key=lambda p: (p.has_ball, p.attack_depth(), self.rng.random()), reverse=True)
            selected.extend(lane_players[:card.per_lane])
        return selected

    def choose_actor(self, team_id: int, card: Card, activated: list[Player]) -> Player | None:
        candidates = [p for p in activated if p.lane in card.lanes and not self.is_off_balance(p) and self.actions_for(card, p)]
        if not candidates:
            return None
        carrier = self.ball_carrier()
        if self.airborne:
            header_candidates = [p for p in candidates if "header" in self.actions_for(card, p) and self.adjacent_to_airborne(p)]
            if header_candidates:
                header_candidates.sort(key=lambda p: (p.team == self.airborne.team, p.attack_depth(), self.rng.random()), reverse=True)
                return header_candidates[0]
        if carrier and carrier.team == team_id and carrier in candidates:
            return carrier
        if carrier and carrier.team != team_id:
            lane_bias = {carrier.lane: 0, "center": 1, "left": 2, "right": 2}
            candidates.sort(
                key=lambda p: (
                    abs(p.depth - carrier.depth),
                    lane_bias.get(p.lane, 2),
                    -p.attack_depth(),
                    self.rng.random(),
                )
            )
            return candidates[0]
        candidates.sort(key=lambda p: (p.attack_depth(), p.lane == "center", self.rng.random()), reverse=True)
        return candidates[0]

    def actions_for(self, card: Card, player: Player) -> tuple[str, ...]:
        if self.is_off_balance(player):
            return ()
        if player.lane not in card.lanes:
            return ()
        actions = card.actions.get(player.third(), ())
        if not self.can_shoot_after_movement(player):
            actions = tuple(action for action in actions if action not in {"shoot", "header"})
        return actions

    def choose_action(self, team_id: int, card: Card, actor: Player) -> str | None:
        actions = self.actions_for(card, actor)
        carrier = self.ball_carrier()
        if "header" in actions and self.airborne and self.adjacent_to_airborne(actor):
            return "header"
        if carrier and carrier.team == team_id and actor.has_ball:
            if "shoot" in actions and self.can_shoot_after_movement(actor) and actor.attack_depth() >= 12 and self.shot_required(actor) <= self.shoot_threshold():
                return "shoot"
            if "cross" in actions and self.best_pass_target(team_id, actor, "cross"):
                return "cross"
        if "tackle" in actions and carrier and carrier.team != team_id and self.adjacent(actor, carrier):
            return "tackle"
        if "clear" in actions and actor.has_ball and self.clear_is_available(team_id, actor):
            if actor.third() == "defensive" or self.markers_on(actor, 1 - team_id):
                return "clear"
        if "dribble" in actions and actor.has_ball and self.has_adjacent_mark(actor, 1 - team_id):
            return "dribble"
        mark_actions = [a for a in actions if a.startswith("mark")]
        if mark_actions and self.rng.random() < self.mark_preference():
            return max(mark_actions, key=lambda a: int(a.split()[1]))
        for action in actions:
            if action == "cross":
                if actor.has_ball and self.best_pass_target(team_id, actor, action):
                    return action
        return actions[0] if actions else None

    def style_weight(self, action_family: str) -> float:
        weights = {
            "balanced": {"mark": 1.0, "pass": 1.0, "shoot": 1.0},
            "mark-heavy": {"mark": 1.8, "pass": 0.85, "shoot": 0.9},
            "pass-heavy": {"mark": 0.75, "pass": 1.6, "shoot": 0.8},
            "shoot-heavy": {"mark": 0.7, "pass": 0.9, "shoot": 1.7},
        }
        return weights.get(self.cfg.bot_style, weights["balanced"])[action_family]

    def mark_preference(self) -> float:
        return {
            "balanced": 0.72,
            "mark-heavy": 0.95,
            "pass-heavy": 0.45,
            "shoot-heavy": 0.38,
        }.get(self.cfg.bot_style, 0.72)

    def shoot_threshold(self) -> int:
        return {
            "balanced": 5,
            "mark-heavy": 5,
            "pass-heavy": 4,
            "shoot-heavy": 6,
        }.get(self.cfg.bot_style, 5)

    def execute_action(self, team_id: int, actor: Player, action: str) -> bool:
        if action.startswith("mark"):
            count = int(action.split()[1])
            self.place_marks(team_id, actor, count)
            return True
        if action == "tackle":
            return self.tackle(team_id, actor)
        if action == "dribble":
            return self.dribble(team_id, actor)
        if action == "clear":
            return self.clear_ball(team_id, actor)
        if action == "header":
            return self.header(team_id, actor)
        if action == "cross":
            return self.cross(team_id, actor)
        if action in {"pass lane", "pass inside", "pass outside"}:
            target = self.best_pass_target(team_id, actor, action)
            return self.pass_ball(team_id, actor, target, source="action") if target else False
        if action == "shoot":
            if not self.can_shoot_after_movement(actor):
                return False
            return self.shoot(team_id, actor)
        return False

    def move_player(self, player: Player) -> int:
        carrier = self.ball_carrier()
        direction = self.attack_direction(player.team)
        if player.has_ball:
            max_move = self.cfg.ball_carrier_movement
            step = min(max_move, self.rng.choice((2, 3, 3, 4)))
            if player.attack_depth() >= 12:
                step = self.rng.choice((0, 1, 2))
            target_depth = max(DEPTH_MIN, min(DEPTH_MAX, player.depth + direction * step))
            spaces, budget = self.move_toward_depth(player, target_depth, max_move)
        elif carrier and carrier.team == player.team:
            max_move = self.cfg.movement_per_activation
            desired = max(DEPTH_MIN, min(DEPTH_MAX, carrier.depth - direction * self.rng.choice([-1, 0, 1])))
            spaces, budget = self.move_toward_depth(player, desired, max_move)
            if player.lane != carrier.lane and self.rng.random() < 0.25:
                player.lane = carrier.lane
        else:
            max_move = self.cfg.movement_per_activation
            desired = self.airborne.depth if self.airborne else (carrier.depth if carrier else 8)
            if carrier and self.rng.random() < 0.7:
                player.lane = carrier.lane
                desired = max(DEPTH_MIN, min(DEPTH_MAX, carrier.depth + self.rng.choice((-1, 0, 1))))
            elif self.airborne and self.rng.random() < 0.8:
                player.lane = self.airborne.lane
                desired = max(DEPTH_MIN, min(DEPTH_MAX, self.airborne.depth + self.rng.choice((-1, 0, 1))))
            spaces, budget = self.move_toward_depth(player, desired, max_move)
        self.sync_player_marks(player, spaces)
        self.stats.movement_used.append(max(0, spaces))
        self.stats.movement_budget_used.append(max(0, budget))
        return max(0, spaces)

    def move_toward_depth(self, player: Player, desired_depth: int, max_budget: int) -> tuple[int, int]:
        spaces = 0
        budget_used = 0
        while player.depth != desired_depth and budget_used < max_budget:
            exit_cost = self.exit_cost(player)
            if budget_used + exit_cost > max_budget:
                break
            player.depth += 1 if desired_depth > player.depth else -1
            spaces += 1
            budget_used += exit_cost
        return spaces, budget_used

    def exit_cost(self, player: Player) -> int:
        if self.markers_on(player, 1 - player.team):
            if self.cfg.mark_mode == "player" and not self.cfg.player_mark_movement_tax:
                return 1
            return self.cfg.marked_hex_exit_cost
        return 1

    def place_marks(self, team_id: int, actor: Player, count: int) -> None:
        if self.cfg.mark_mode == "player":
            self.place_player_mark(team_id, actor)
            return
        candidates = self.adjacent_cells(actor)
        self.rng.shuffle(candidates)
        for lane, depth in candidates[:count]:
            self.marks.append(Mark(team_id, lane, depth, self.step, actor.pid))
            self.stats.marks_placed += 1

    def place_player_mark(self, team_id: int, actor: Player) -> None:
        if any(m.team == team_id and m.defender_id == actor.pid for m in self.marks):
            return
        candidates = [
            p for p in self.team_players(1 - team_id)
            if self.adjacent(actor, p)
            and not any(m.target_team == p.team and m.target_id == p.pid for m in self.marks)
        ]
        if not candidates:
            return
        carrier = self.ball_carrier()
        candidates.sort(key=lambda p: (
            0 if carrier and p.team == carrier.team and p.pid == carrier.pid else 1,
            -p.attack_depth(),
            0 if p.lane == "center" else 1,
            self.rng.random(),
        ))
        target = candidates[0]
        self.marks.append(Mark(team_id, target.lane, target.depth, self.step, actor.pid, target.team, target.pid))
        self.stats.marks_placed += 1

    def adjacent_cells(self, player: Player) -> list[tuple[str, int]]:
        cells = []
        for delta in (-1, 0, 1):
            if delta:
                cells.append((player.lane, max(DEPTH_MIN, min(DEPTH_MAX, player.depth + delta))))
        if player.lane == "center":
            cells.append(("left", player.depth))
            cells.append(("right", player.depth))
        else:
            cells.append(("center", player.depth))
        return cells

    def tackle(self, team_id: int, actor: Player) -> bool:
        carrier = self.ball_carrier()
        if not carrier or carrier.team == team_id or not self.adjacent(actor, carrier):
            return False
        self.stats.tackles_attempted += 1
        if self.rng.random() < 0.5:
            carrier.has_ball = False
            actor.has_ball = True
            self.possession = team_id
            self.stats.tackles_successful += 1
            self.stats.turnovers += 1
            return True
        actor.off_balance_until_step = self.step
        self.stats.off_balance_events += 1
        return False

    def dribble(self, team_id: int, actor: Player) -> bool:
        removed = self.remove_adjacent_mark(actor, 1 - team_id)
        if removed:
            self.stats.dribbles += 1
        return removed

    def clear_ball(self, team_id: int, actor: Player) -> bool:
        if not actor.has_ball or not self.clear_is_available(team_id, actor):
            return False
        self.stats.clears_attempted += 1
        actor.has_ball = False
        direction = self.attack_direction(team_id)
        target_depth = max(DEPTH_MIN, min(DEPTH_MAX, actor.depth + direction * self.rng.choice((3, 4, 5))))
        candidates = [
            p for p in self.team_players(team_id)
            if p is not actor and abs(p.depth - target_depth) <= 1
        ]
        if candidates:
            candidates.sort(key=lambda p: (abs(p.depth - target_depth), p.lane == actor.lane, self.rng.random()))
            candidates[0].has_ball = True
            self.stats.clears_recovered += 1
        else:
            self.possession = 1 - team_id
            self.stats.turnovers += 1
            defenders = self.team_players(1 - team_id)
            if defenders:
                min(defenders, key=lambda p: abs(p.depth - target_depth)).has_ball = True
        return True

    def cross(self, team_id: int, actor: Player) -> bool:
        if not actor.has_ball or actor.lane == "center":
            return False
        target_depth = max(DEPTH_MIN, min(DEPTH_MAX, actor.depth + self.attack_direction(team_id) * self.rng.choice((0, 1))))
        if self.cross_is_blocked(team_id, actor, target_depth):
            return False
        actor.has_ball = False
        self.airborne = AirborneBall(team=team_id, lane="center", depth=target_depth, created_step=self.step)
        self.stats.crosses_attempted += 1
        return True

    def header(self, team_id: int, actor: Player) -> bool:
        if not self.airborne or not self.adjacent_to_airborne(actor) or self.moved_this_resolution(actor):
            return False
        self.stats.headers_attempted += 1
        crossing_team = self.airborne.team
        self.airborne = None
        if team_id == crossing_team:
            modifier = max(0, self.shot_blockers(team_id, actor) - 1)
            required_roll = self.base_shot_target(actor) + modifier
            goal = self.roll_check(required_roll=self.base_shot_target(actor), modifier=modifier)
            self.stats.shots += 1
            self.record_shot_event(
                team_id=team_id,
                actor=actor,
                action="header",
                required_roll=required_roll,
                blockers=modifier,
                markers=0,
                goalie_modifier=0,
                goal=goal,
            )
            if goal:
                self.stats.goals += 1
                self.stats.headers_scored += 1
                self.reset_after_goal(1 - team_id)
            return True
        actor.has_ball = True
        self.possession = team_id
        self.clear_ball(team_id, actor)
        return True

    def try_free_pass(self, team_id: int) -> tuple[Player, Player] | None:
        actor = self.ball_carrier()
        if not actor or actor.team != team_id or self.airborne:
            return None
        target = self.best_pass_target(team_id, actor, "standard pass")
        if not target:
            return None
        if target.attack_depth() < actor.attack_depth() and self.rng.random() > 0.15:
            return None
        passer = actor
        return (passer, target) if self.pass_ball(team_id, actor, target, source="free") else None

    def try_flank_service_shot(
        self,
        team_id: int,
        card: Card,
        activated: list[Player],
        free_pass: tuple[Player, Player] | None,
    ) -> bool:
        if not free_pass:
            return False
        passer, receiver = free_pass
        if passer.lane == "center" or passer.third() != "attacking":
            return False
        if receiver.lane != "center" or receiver.third() != "attacking":
            return False
        if card.mode not in {"lane", "split-lane"} or passer.lane not in card.lanes:
            return False
        if "cross" not in card.actions.get("attacking", ()):
            return False
        if not self.can_shoot_after_movement(receiver):
            return False
        self.stats.service_attempts += 1
        self.stats.actions_selected["service"] += 1
        self.stats.service_shots += 1
        before_goals = self.stats.goals
        self.shoot(team_id, receiver)
        if self.stats.goals > before_goals:
            self.stats.service_goals += 1
        return True

    def pass_ball(self, team_id: int, actor: Player, target: Player | None, source: str = "free") -> bool:
        if not target:
            return False
        self.stats.passes_attempted += 1
        if source == "free":
            self.stats.free_passes_attempted += 1
        else:
            self.stats.action_passes_attempted += 1
        if self.cfg.offside_enabled and not self.onside(team_id, target):
            self.stats.offside_violations += 1
            return False
        modifier = self.pass_modifier(team_id, actor, target)
        if self.roll_check(required_roll=1, modifier=modifier):
            actor.has_ball = False
            target.has_ball = True
            self.stats.passes_completed += 1
            if source == "free":
                self.stats.free_passes_completed += 1
            else:
                self.stats.action_passes_completed += 1
            return True
        return False

    def pass_modifier(self, team_id: int, actor: Player, target: Player) -> int:
        defenders = self.defenders_between(team_id, actor, target)
        if self.cfg.mark_mode == "player":
            return (
                defenders
                + self.markers_on(actor, 1 - team_id)
                + self.markers_on(target, 1 - team_id)
            )
        return defenders * abs(self.cfg.defender_pass_penalty)

    def shoot(self, team_id: int, actor: Player) -> bool:
        if not actor.has_ball:
            return False
        self.stats.shots += 1
        defenders = self.shot_blockers(team_id, actor)
        markers = self.markers_on(actor, 1 - team_id)
        goalie_modifier = self.goalie_modifier(team_id, actor)
        modifier = (
            defenders * abs(self.cfg.defender_shot_penalty)
            + markers * abs(self.cfg.marker_shot_penalty)
            + goalie_modifier
        )
        required_roll = self.base_shot_target(actor) + modifier
        goal = self.roll_check(required_roll=self.base_shot_target(actor), modifier=modifier)
        self.record_shot_event(
            team_id=team_id,
            actor=actor,
            action="shoot",
            required_roll=required_roll,
            blockers=defenders,
            markers=markers,
            goalie_modifier=goalie_modifier,
            goal=goal,
        )
        if goal:
            self.stats.goals += 1
            self.reset_after_goal(1 - team_id)
            return True
        return True

    def record_shot_event(
        self,
        team_id: int,
        actor: Player,
        action: str,
        required_roll: int,
        blockers: int,
        markers: int,
        goalie_modifier: int,
        goal: bool,
    ) -> None:
        free_pass_from_lane = ""
        free_pass_from_third = ""
        received_free_pass = False
        if self.last_free_pass:
            passer, receiver = self.last_free_pass
            received_free_pass = receiver is actor
            if received_free_pass:
                free_pass_from_lane = passer.lane
                free_pass_from_third = passer.third()
        self.stats.shot_events.append(ShotEvent(
            match_id=self.match_id,
            round_index=self.current_round,
            step=self.step,
            team=team_id,
            role=self.current_role,
            card=self.current_card_name,
            action=action,
            shooter_pid=actor.pid,
            shooter_lane=actor.lane,
            shooter_third=actor.third(),
            shooter_depth=actor.depth,
            shooter_attack_depth=actor.attack_depth(),
            shooter_moved=self.moved_spaces_this_resolution(actor),
            received_free_pass=received_free_pass,
            free_pass_from_lane=free_pass_from_lane,
            free_pass_from_third=free_pass_from_third,
            required_roll=required_roll,
            blockers=blockers,
            markers=markers,
            goalie_modifier=goalie_modifier,
            goal=goal,
        ))

    def best_pass_target(self, team_id: int, actor: Player, action: str) -> Player | None:
        targets = [p for p in self.team_players(team_id) if p is not actor]
        if action == "standard pass":
            targets = [p for p in targets if self.is_standard_pass_target(actor, p)]
        else:
            lanes = self.pass_target_lanes(actor, action)
            thirds = self.pass_target_thirds(actor, action)
            targets = [p for p in targets if p.lane in lanes and p.third() in thirds]
        if action == "cross" and actor.lane == "center":
            return None
        if self.cfg.offside_enabled:
            legal = [p for p in targets if self.onside(team_id, p)]
            targets = legal or targets
        if not targets:
            return None
        targets.sort(key=lambda p: (p.attack_depth(), -self.defenders_between(team_id, actor, p), self.rng.random()), reverse=True)
        return targets[0]

    def is_standard_pass_target(self, actor: Player, target: Player) -> bool:
        lane_distance = abs(LANES.index(actor.lane) - LANES.index(target.lane))
        third_distance = abs(THIRDS.index(actor.third()) - THIRDS.index(target.third()))
        return lane_distance + third_distance <= 1

    def pass_target_lanes(self, actor: Player, action: str) -> tuple[str, ...]:
        if action == "pass lane":
            return (actor.lane,)
        if action == "pass inside":
            if actor.lane == "center":
                return ()
            return ("center",)
        if action == "pass outside":
            if actor.lane != "center":
                return ()
            return ("left", "right")
        if action == "cross":
            return ("center",)
        return ()

    def pass_target_thirds(self, actor: Player, action: str) -> tuple[str, ...]:
        third = actor.third()
        if third == "defensive":
            return ("defensive", "midfield")
        if third == "midfield":
            return THIRDS
        return ("midfield", "attacking")

    def onside(self, team_id: int, target: Player) -> bool:
        defenders = self.team_players(1 - team_id)
        target_progress = target.attack_depth()
        defender_progress = [p.depth if team_id == 0 else DEPTH_MAX - p.depth for p in defenders]
        last_defender = max(defender_progress)
        return target_progress <= last_defender + 1

    def defenders_between(self, team_id: int, a: Player, b: Player) -> int:
        lo, hi = sorted((a.depth, b.depth))
        lane_set = {a.lane, b.lane, "center"}
        player_blocks = sum(1 for p in self.team_players(1 - team_id) if lo < p.depth < hi and p.lane in lane_set)
        mark_blocks = sum(1 for m in self.marks if m.team == 1 - team_id and lo < m.depth < hi and m.lane in lane_set)
        return player_blocks + mark_blocks

    def shot_blockers(self, team_id: int, shooter: Player) -> int:
        direction = self.attack_direction(team_id)
        player_blocks = sum(
            1 for p in self.team_players(1 - team_id)
            if (p.depth - shooter.depth) * direction > 0 and p.lane in {shooter.lane, "center"}
        )
        mark_blocks = sum(
            1 for m in self.marks
            if m.team == 1 - team_id
            and (m.depth - shooter.depth) * direction > 0
            and m.lane in {shooter.lane, "center"}
        )
        return player_blocks + mark_blocks

    def shot_score(self, shooter: Player) -> int:
        return 7 - self.shot_required(shooter)

    def shot_required(self, shooter: Player) -> int:
        return (
            self.base_shot_target(shooter)
            + self.shot_blockers(shooter.team, shooter) * abs(self.cfg.defender_shot_penalty)
            + self.markers_on(shooter, 1 - shooter.team) * abs(self.cfg.marker_shot_penalty)
            + self.goalie_modifier(shooter.team, shooter)
        )

    def base_shot_target(self, shooter: Player) -> int:
        if self.cfg.shot_target_mode == "lane":
            return self.cfg.center_shot_target_number if shooter.lane == "center" else self.cfg.wide_shot_target_number
        return self.cfg.shot_target_number

    def goalie_modifier(self, team_id: int, shooter: Player) -> int:
        if not self.cfg.goalie_enabled:
            return 0
        return self.cfg.goalie_shot_penalty

    def markers_on(self, player: Player, marking_team: int) -> int:
        if self.cfg.mark_mode == "player":
            return sum(
                1 for m in self.marks
                if m.team == marking_team and m.target_team == player.team and m.target_id == player.pid
            )
        return sum(1 for m in self.marks if m.team == marking_team and m.lane == player.lane and abs(m.depth - player.depth) <= 0)

    def has_adjacent_mark(self, player: Player, marking_team: int) -> bool:
        if self.cfg.mark_mode == "player":
            return self.markers_on(player, marking_team) > 0
        return any(
            m.team == marking_team
            and (m.lane == player.lane or "center" in {m.lane, player.lane})
            and abs(m.depth - player.depth) <= 1
            for m in self.marks
        )

    def remove_adjacent_mark(self, player: Player, marking_team: int) -> bool:
        if self.cfg.mark_mode == "player":
            for idx, mark in enumerate(self.marks):
                if mark.team == marking_team and mark.target_team == player.team and mark.target_id == player.pid:
                    del self.marks[idx]
                    return True
            return False
        for idx, mark in enumerate(self.marks):
            if mark.team != marking_team:
                continue
            if (mark.lane == player.lane or "center" in {mark.lane, player.lane}) and abs(mark.depth - player.depth) <= 1:
                del self.marks[idx]
                return True
        return False

    def clear_is_available(self, team_id: int, actor: Player) -> bool:
        direction = self.attack_direction(team_id)
        pressure_depths = {actor.depth + direction}
        return not any(
            p.team != team_id
            and p.lane in {actor.lane, "center"}
            and p.depth in pressure_depths
            for p in self.players
        )

    def cross_is_blocked(self, team_id: int, actor: Player, target_depth: int) -> bool:
        return any(
            p.team != team_id
            and abs(p.depth - actor.depth) <= 1
            and p.lane in {actor.lane, "center"}
            and min(actor.depth, target_depth) <= p.depth <= max(actor.depth, target_depth)
            for p in self.players
        )

    def adjacent_to_airborne(self, player: Player) -> bool:
        return bool(
            self.airborne
            and abs(player.depth - self.airborne.depth) <= 1
            and (player.lane == self.airborne.lane or "center" in {player.lane, self.airborne.lane})
        )

    def is_off_balance(self, player: Player) -> bool:
        return player.off_balance_until_step > 0

    def moved_this_resolution(self, player: Player) -> bool:
        return self.moved_spaces_this_resolution(player) > 0

    def moved_spaces_this_resolution(self, player: Player) -> int:
        return self.moved_this_card.get((player.team, player.pid), 0)

    def can_shoot_after_movement(self, player: Player) -> bool:
        return self.moved_spaces_this_resolution(player) <= self.cfg.shooter_movement_allowance

    def clear_team_off_balance(self, team_id: int) -> None:
        for player in self.team_players(team_id):
            if player.off_balance_until_step and self.step > player.off_balance_until_step:
                player.off_balance_until_step = 0

    def adjacent(self, a: Player, b: Player) -> bool:
        return abs(a.depth - b.depth) <= 1 and (a.lane == b.lane or "center" in {a.lane, b.lane})

    def roll_check(self, required_roll: int, modifier: int) -> bool:
        target = required_roll + modifier
        if target <= 1:
            return True
        return self.rng.randint(1, 6) >= target

    def expire_marks(self) -> None:
        self.marks = [m for m in self.marks if self.step <= m.created_step + self.cfg.mark_duration]

    def expire_airborne(self) -> None:
        if self.airborne and self.step > self.airborne.created_step + 2:
            self.possession = 1 - self.airborne.team
            receivers = self.team_players(self.possession)
            if receivers:
                min(receivers, key=lambda p: abs(p.depth - self.airborne.depth)).has_ball = True
            self.airborne = None
            self.stats.turnovers += 1

    def clear_player_marks_if_needed(self, player: Player) -> None:
        self.marks = [m for m in self.marks if not (m.team == player.team and m.defender_id == player.pid and self.step > m.created_step)]

    def sync_player_marks(self, player: Player, spaces_moved: int) -> None:
        if self.cfg.mark_mode != "player":
            return
        synced: list[Mark] = []
        for mark in self.marks:
            if mark.target_team != player.team or mark.target_id != player.pid:
                synced.append(mark)
                continue
            marker = next((p for p in self.players if p.team == mark.team and p.pid == mark.defender_id), None)
            if marker and spaces_moved <= 1 and self.adjacent(marker, player):
                mark.lane = player.lane
                mark.depth = player.depth
                synced.append(mark)
        self.marks = synced

    def reset_after_goal(self, kickoff_team: int) -> None:
        for p in self.players:
            p.has_ball = False
            p.off_balance_until_step = 0
        self.players = self.starting_players()
        for p in self.players:
            if p.team == kickoff_team and p.pid == 1:
                p.has_ball = True
            elif p.team != kickoff_team and p.pid == 1:
                p.has_ball = False
        self.possession = kickoff_team
        self.marks.clear()
        self.airborne = None

    def team_players(self, team_id: int) -> list[Player]:
        return [p for p in self.players if p.team == team_id]

    def ball_carrier(self) -> Player | None:
        return next((p for p in self.players if p.has_ball), None)


def config_rows(cfg: Config) -> dict[str, int | str | bool]:
    return {
        "movement_per_activation": cfg.movement_per_activation,
        "ball_carrier_movement": cfg.ball_carrier_movement,
        "mark_duration": cfg.mark_duration,
        "marked_hex_exit_cost": cfg.marked_hex_exit_cost,
        "defender_pass_penalty": cfg.defender_pass_penalty,
        "defender_shot_penalty": cfg.defender_shot_penalty,
        "marker_shot_penalty": cfg.marker_shot_penalty,
        "shot_target_number": cfg.shot_target_number,
        "shot_target_mode": cfg.shot_target_mode,
        "center_shot_target_number": cfg.center_shot_target_number,
        "wide_shot_target_number": cfg.wide_shot_target_number,
        "goalie_enabled": cfg.goalie_enabled,
        "goalie_shot_penalty": cfg.goalie_shot_penalty,
        "offside_enabled": cfg.offside_enabled,
        "bot_style": cfg.bot_style,
        "shooter_movement_allowance": cfg.shooter_movement_allowance,
        "flank_service_enabled": cfg.flank_service_enabled,
        "mark_mode": cfg.mark_mode,
        "player_mark_movement_tax": cfg.player_mark_movement_tax,
    }


def aggregate(results: list[MatchStats], cfg: Config, seed: int) -> dict[str, float]:
    n = len(results)
    total = MatchStats()
    for r in results:
        for field_name in (
            "shots", "goals", "passes_attempted", "passes_completed",
            "free_passes_attempted", "free_passes_completed",
            "action_passes_attempted", "action_passes_completed", "tackles_attempted",
            "tackles_successful", "marks_placed", "offside_violations", "rounds_with_no_shot",
            "turnovers", "crosses_attempted", "headers_attempted", "headers_scored",
            "clears_attempted", "clears_recovered", "dribbles", "off_balance_events",
            "service_attempts", "service_shots", "service_goals",
        ):
            setattr(total, field_name, getattr(total, field_name) + getattr(r, field_name))
        total.cards_played.update(r.cards_played)
        total.actions_selected.update(r.actions_selected)
        total.meaningful_cards.update(r.meaningful_cards)
        total.no_effect_cards.update(r.no_effect_cards)
        total.no_eligible_activation.update(r.no_eligible_activation)
        total.active_mark_samples.extend(r.active_mark_samples)
        total.activations.extend(r.activations)
        total.movement_used.extend(r.movement_used)
        total.movement_budget_used.extend(r.movement_budget_used)
        total.possession_depth_samples.extend(r.possession_depth_samples)
        total.shot_events.extend(r.shot_events)

    return {
        **config_rows(cfg),
        "seed": seed,
        "matches": n,
        "shots_per_match": total.shots / n,
        "goals_per_match": total.goals / n,
        "passes_attempted_per_match": total.passes_attempted / n,
        "passes_completed_per_match": total.passes_completed / n,
        "free_passes_attempted_per_match": total.free_passes_attempted / n,
        "free_pass_completion_rate": total.free_passes_completed / total.free_passes_attempted if total.free_passes_attempted else 0,
        "action_passes_attempted_per_match": total.action_passes_attempted / n,
        "action_pass_completion_rate": total.action_passes_completed / total.action_passes_attempted if total.action_passes_attempted else 0,
        "pass_completion_rate": total.passes_completed / total.passes_attempted if total.passes_attempted else 0,
        "tackles_attempted_per_match": total.tackles_attempted / n,
        "tackles_success_rate": total.tackles_successful / total.tackles_attempted if total.tackles_attempted else 0,
        "marks_placed_per_match": total.marks_placed / n,
        "average_marks_active": mean(total.active_mark_samples) if total.active_mark_samples else 0,
        "offside_violations_per_match": total.offside_violations / n,
        "rounds_with_no_shot_per_match": total.rounds_with_no_shot / n,
        "turnovers_per_match": total.turnovers / n,
        "crosses_attempted_per_match": total.crosses_attempted / n,
        "headers_attempted_per_match": total.headers_attempted / n,
        "headers_scored_per_match": total.headers_scored / n,
        "clears_attempted_per_match": total.clears_attempted / n,
        "clear_recovery_rate": total.clears_recovered / total.clears_attempted if total.clears_attempted else 0,
        "dribbles_per_match": total.dribbles / n,
        "off_balance_events_per_match": total.off_balance_events / n,
        "service_attempts_per_match": total.service_attempts / n,
        "service_shots_per_match": total.service_shots / n,
        "service_goals_per_match": total.service_goals / n,
        "average_activations_per_card": mean(total.activations) if total.activations else 0,
        "average_movement_used": mean(total.movement_used) if total.movement_used else 0,
        "average_movement_budget_used": mean(total.movement_budget_used) if total.movement_budget_used else 0,
        "average_ball_depth": mean(total.possession_depth_samples) if total.possession_depth_samples else 0,
        "_cards_played": total.cards_played,
        "_actions_selected": total.actions_selected,
        "_meaningful_cards": total.meaningful_cards,
        "_no_effect_cards": total.no_effect_cards,
        "_no_eligible_activation": total.no_eligible_activation,
        "_shot_events": total.shot_events,
    }


def write_csv(path: Path, summary: dict[str, float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    scalar_keys = [k for k in summary if not k.startswith("_")]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["metric", "value"])
        for key in scalar_keys:
            writer.writerow([key, f"{summary[key]:.4f}" if isinstance(summary[key], float) else summary[key]])
        writer.writerow([])
        writer.writerow(["cards_played", "count"])
        for key, value in summary["_cards_played"].most_common():
            writer.writerow([key, value])
        writer.writerow([])
        writer.writerow(["actions_selected", "count"])
        for key, value in summary["_actions_selected"].most_common():
            writer.writerow([key, value])
        writer.writerow([])
        writer.writerow(["card", "meaningful", "no_effect", "no_eligible_activation"])
        cards = sorted({c.name for c in STARTER_CARDS})
        for card in cards:
            writer.writerow([
                card,
                summary["_meaningful_cards"][card],
                summary["_no_effect_cards"][card],
                summary["_no_eligible_activation"][card],
            ])


SHOT_EVENT_COLUMNS = [
    "match_id",
    "round_index",
    "step",
    "team",
    "role",
    "card",
    "action",
    "shooter_pid",
    "shooter_lane",
    "shooter_third",
    "shooter_depth",
    "shooter_attack_depth",
    "shooter_moved",
    "received_free_pass",
    "free_pass_from_lane",
    "free_pass_from_third",
    "required_roll",
    "blockers",
    "markers",
    "goalie_modifier",
    "goal",
]


def write_shot_events_csv(path: Path, shot_events: list[ShotEvent]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SHOT_EVENT_COLUMNS)
        writer.writeheader()
        for event in shot_events:
            writer.writerow({column: getattr(event, column) for column in SHOT_EVENT_COLUMNS})


def print_summary(summary: dict[str, float]) -> None:
    print("Futbol '99 starter-deck simulation")
    print("=" * 38)
    print("Parameters:")
    for key in [
        "movement_per_activation", "ball_carrier_movement", "shot_target_number",
        "shot_target_mode", "center_shot_target_number", "wide_shot_target_number",
        "goalie_enabled", "goalie_shot_penalty", "marked_hex_exit_cost",
        "mark_duration", "bot_style", "offside_enabled", "shooter_movement_allowance",
        "flank_service_enabled", "seed",
    ]:
        print(f"{key}: {summary[key]}")
    print()
    for key in [
        "matches", "shots_per_match", "goals_per_match", "passes_attempted_per_match",
        "pass_completion_rate", "free_passes_attempted_per_match", "free_pass_completion_rate",
        "action_passes_attempted_per_match", "action_pass_completion_rate",
        "tackles_attempted_per_match", "tackles_success_rate",
        "marks_placed_per_match", "average_marks_active", "offside_violations_per_match",
        "rounds_with_no_shot_per_match", "average_movement_used", "average_movement_budget_used",
        "average_ball_depth", "crosses_attempted_per_match", "headers_attempted_per_match",
        "headers_scored_per_match", "clears_attempted_per_match", "clear_recovery_rate",
        "dribbles_per_match", "off_balance_events_per_match", "service_attempts_per_match",
        "service_shots_per_match", "service_goals_per_match",
    ]:
        value = summary[key]
        print(f"{key}: {value:.3f}" if isinstance(value, float) else f"{key}: {value}")

    actions = summary["_actions_selected"]
    print("\nMost used actions:")
    for action, count in actions.most_common(8):
        print(f"- {action}: {count}")
    print("\nUnderused actions:")
    for action in sorted({"mark 2", "mark 3", "tackle", "cross", "header", "clear", "dribble", "shoot", "service"}):
        if actions[action] == 0:
            print(f"- {action}: never used")

    print("\nCard effect flags:")
    for card in sorted({c.name for c in STARTER_CARDS}):
        played = summary["_cards_played"][card]
        no_effect = summary["_no_effect_cards"][card]
        no_eligible = summary["_no_eligible_activation"][card]
        rate = no_effect / played if played else 0
        if rate > 0.55 or no_eligible > played * 0.25:
            print(f"- {card}: possible issue, no_effect={rate:.1%}, no_eligible={no_eligible}/{played}")

    movement = summary["average_movement_used"]
    if movement < 2.0:
        print(f"\nMovement read: movement {summary['movement_per_activation']} may be higher than bots need, or board pressure is too loose.")
    elif movement > 4.4:
        print(f"\nMovement read: movement {summary['movement_per_activation']} is being used heavily and may be important or too low.")
    else:
        print(f"\nMovement read: movement {summary['movement_per_activation']} appears actively used but not maxed every activation.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Futbol '99 starter-deck simulations.")
    parser.add_argument("--matches", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=99)
    parser.add_argument("--output", type=Path, default=Path("sim/results/summary.csv"))
    parser.add_argument("--shot-events-output", type=Path, default=None)
    parser.add_argument("--movement", type=int, default=4)
    parser.add_argument("--ball-carrier-movement", type=int, default=2)
    parser.add_argument("--mark-duration", type=int, default=2)
    parser.add_argument("--marked-exit-cost", type=int, default=2)
    parser.add_argument("--shot-target", type=int, default=5, choices=range(1, 7), metavar="1-6")
    parser.add_argument("--shot-target-mode", choices=("flat", "lane"), default="flat")
    parser.add_argument("--center-shot-target", type=int, default=4, choices=range(1, 7), metavar="1-6")
    parser.add_argument("--wide-shot-target", type=int, default=5, choices=range(1, 7), metavar="1-6")
    parser.add_argument("--goalie", choices=("on", "off"), default="off")
    parser.add_argument("--goalie-shot-penalty", type=int, default=1)
    parser.add_argument("--offside", choices=("on", "off"), default="on")
    parser.add_argument("--bot-style", choices=("balanced", "mark-heavy", "pass-heavy", "shoot-heavy"), default="balanced")
    parser.add_argument("--shooter-move-allowance", type=int, default=0)
    parser.add_argument("--flank-service", choices=("on", "off"), default="off")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = Config(
        movement_per_activation=args.movement,
        ball_carrier_movement=args.ball_carrier_movement,
        mark_duration=args.mark_duration,
        marked_hex_exit_cost=args.marked_exit_cost,
        shot_target_number=args.shot_target,
        shot_target_mode=args.shot_target_mode,
        center_shot_target_number=args.center_shot_target,
        wide_shot_target_number=args.wide_shot_target,
        goalie_enabled=args.goalie == "on",
        goalie_shot_penalty=args.goalie_shot_penalty,
        offside_enabled=args.offside == "on",
        bot_style=args.bot_style,
        shooter_movement_allowance=args.shooter_move_allowance,
        flank_service_enabled=args.flank_service == "on",
    )
    rng = random.Random(args.seed)
    results = [Match(cfg, rng, match_id=i + 1).run() for i in range(args.matches)]
    summary = aggregate(results, cfg, args.seed)
    write_csv(args.output, summary)
    shot_events_output = args.shot_events_output or args.output.with_name(f"{args.output.stem}_shot_events.csv")
    write_shot_events_csv(shot_events_output, summary["_shot_events"])
    print_summary(summary)
    print(f"\nCSV written to {args.output}")
    print(f"Shot events CSV written to {shot_events_output}")


if __name__ == "__main__":
    main()
