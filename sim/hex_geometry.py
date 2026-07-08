"""Real pitch geometry helpers for Futbol '99 simulations.

This mirrors the browser prototype's odd-q flat-top hex pitch:
17 columns, even columns with 13 cells, odd columns with 12 cells.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from functools import lru_cache
from math import floor, sqrt
from typing import Callable, Iterable


FIELD_WIDTH = 17
FIELD_HEIGHT = 13
LANES = ("left", "center", "right")
THIRDS = ("defensive", "midfield", "attacking")
TEAMS = ("player", "ai")
Coord = tuple[int, int]


@dataclass(frozen=True)
class Zones:
    third: str
    lane: str
    lanes: tuple[str, ...]
    lane_label: str


def column_height(x: int) -> int:
    return FIELD_HEIGHT if x % 2 == 0 else FIELD_HEIGHT - 1


def is_valid(coord: Coord) -> bool:
    x, y = coord
    return 0 <= x < FIELD_WIDTH and 0 <= y < column_height(x)


@lru_cache(maxsize=1)
def all_cells() -> tuple[Coord, ...]:
    return tuple((x, y) for x in range(FIELD_WIDTH) for y in range(column_height(x)))


def offset_to_axial(coord: Coord) -> tuple[int, int]:
    x, y = coord
    q = x
    r = y - floor(x / 2)
    return q, r


def axial_to_offset(q: int, r: int) -> Coord:
    return q, r + floor(q / 2)


def distance(a: Coord, b: Coord) -> int:
    q1, r1 = offset_to_axial(a)
    q2, r2 = offset_to_axial(b)
    return int((abs(q1 - q2) + abs(q1 + r1 - q2 - r2) + abs(r1 - r2)) / 2)


def neighbors(coord: Coord) -> tuple[Coord, ...]:
    x, y = coord
    candidates: list[Coord] = [
        (x - 1, y),
        (x + 1, y),
        (x, y - 1),
        (x, y + 1),
    ]
    if x % 2 == 1:
        candidates.extend([(x - 1, y + 1), (x + 1, y + 1)])
    else:
        candidates.extend([(x - 1, y - 1), (x + 1, y - 1)])
    return tuple(c for c in candidates if is_valid(c))


def zones(coord: Coord, perspective_team: str = "player") -> Zones:
    x, y = coord
    third = "defensive" if x <= 5 else "midfield" if x <= 10 else "attacking"
    if perspective_team == "ai":
        third = {"defensive": "attacking", "midfield": "midfield", "attacking": "defensive"}[third]

    short_column = x % 2 == 1
    lane = "left" if y <= 3 else "center" if y <= 8 else "right"
    lane_label = lane
    lanes = (lane,)

    if short_column and y == 3:
        lane = "left"
        lane_label = "left/center"
        lanes = ("left", "center")
    elif short_column and y == 8:
        lane = "center"
        lane_label = "center/right"
        lanes = ("center", "right")

    if perspective_team == "ai":
        def flip(lane_name: str) -> str:
            if lane_name == "left":
                return "right"
            if lane_name == "right":
                return "left"
            return lane_name

        lane = flip(lane)
        lanes = tuple(flip(l) for l in lanes)
        lane_label = "/".join(lanes)

    return Zones(third=third, lane=lane, lanes=lanes, lane_label=lane_label)


def _cube_round(qf: float, rf: float) -> tuple[int, int]:
    sf = -qf - rf
    q = round(qf)
    r = round(rf)
    s = round(sf)

    q_diff = abs(q - qf)
    r_diff = abs(r - rf)
    s_diff = abs(s - sf)

    if q_diff > r_diff and q_diff > s_diff:
        q = -r - s
    elif r_diff > s_diff:
        r = -q - s
    return int(q), int(r)


def hex_line(start: Coord, end: Coord, include_ends: bool = False) -> tuple[Coord, ...]:
    """Return cells crossed from center to center.

    When the line lies exactly on a hex edge, this samples just off both sides
    and includes both adjacent paths. That matches the tabletop ruling that
    threading a pass between two defenders counts both hexes.
    """
    dist = distance(start, end)
    if dist == 0:
        return (start,) if include_ends else ()

    q1, r1 = offset_to_axial(start)
    q2, r2 = offset_to_axial(end)
    samples: set[Coord] = set()
    eps = 1e-6
    # Center sample plus two tiny perpendicular offsets to catch edge lines.
    dq = q2 - q1
    dr = r2 - r1
    length = sqrt(dq * dq + dr * dr) or 1
    offsets = ((0.0, 0.0), (-dr / length * eps, dq / length * eps), (dr / length * eps, -dq / length * eps))

    for i in range(0, dist + 1):
        t = i / dist
        for oq, or_ in offsets:
            q, r = _cube_round(q1 + dq * t + oq, r1 + dr * t + or_)
            coord = axial_to_offset(q, r)
            if is_valid(coord):
                samples.add(coord)

    if not include_ends:
        samples.discard(start)
        samples.discard(end)

    return tuple(sorted(samples, key=lambda c: (distance(start, c), c[0], c[1])))


def reachable(
    start: Coord,
    budget: int,
    occupied: Iterable[Coord] = (),
    exit_cost: Callable[[Coord], int] | None = None,
) -> dict[Coord, int]:
    occupied_set = set(occupied)
    costs = {start: 0}
    queue: deque[Coord] = deque([start])

    while queue:
        current = queue.popleft()
        current_cost = costs[current]
        step_cost = exit_cost(current) if exit_cost else 1
        for nxt in neighbors(current):
            if nxt in occupied_set and nxt != start:
                continue
            next_cost = current_cost + step_cost
            if next_cost > budget:
                continue
            if nxt not in costs or next_cost < costs[nxt]:
                costs[nxt] = next_cost
                queue.append(nxt)

    return costs


def standard_pass_allowed(passer: Coord, target: Coord, team: str) -> bool:
    passer_zones = zones(passer, team)
    target_zones = zones(target, team)
    for passer_lane in passer_zones.lanes:
        for target_lane in target_zones.lanes:
            lane_distance = abs(LANES.index(passer_lane) - LANES.index(target_lane))
            third_distance = abs(THIRDS.index(passer_zones.third) - THIRDS.index(target_zones.third))
            if lane_distance + third_distance <= 1:
                return True
    return False


def goal_cells(team: str) -> tuple[Coord, ...]:
    goal_x = FIELD_WIDTH - 1 if team == "player" else 0
    return tuple((goal_x, y) for y in (5, 6, 7))


def default_goal_cell(team: str) -> Coord:
    return FIELD_WIDTH - 1 if team == "player" else 0, 6


def attacking_direction(team: str) -> int:
    return 1 if team == "player" else -1
