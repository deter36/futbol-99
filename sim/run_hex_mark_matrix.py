#!/usr/bin/env python3
"""Run the first real-hex MARK comparison matrix."""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from hex_simulate import HexConfig, HexMatch, aggregate, print_summary, write_csv


CASES = [
    {
        "test_name": "real_hex_mark_baseline",
        "mark_mode": "hex",
        "mark_duration": 2,
        "player_mark_movement_tax": True,
        "seed": 8101,
    },
    {
        "test_name": "real_player_mark_tax",
        "mark_mode": "player",
        "mark_duration": 2,
        "player_mark_movement_tax": True,
        "seed": 8102,
    },
    {
        "test_name": "real_player_mark_no_tax",
        "mark_mode": "player",
        "mark_duration": 2,
        "player_mark_movement_tax": False,
        "seed": 8103,
    },
    {
        "test_name": "real_player_mark_duration1",
        "mark_mode": "player",
        "mark_duration": 1,
        "player_mark_movement_tax": True,
        "seed": 8104,
    },
]


COLUMNS = [
    "test_name",
    "matches",
    "seed",
    "mark_mode",
    "mark_duration",
    "player_mark_movement_tax",
    "movement_per_activation",
    "ball_carrier_movement",
    "shot_target_number",
    "shots_per_match",
    "goals_per_match",
    "passes_attempted_per_match",
    "pass_completion_rate",
    "reset_passes_per_match",
    "reset_completion_rate",
    "progressive_passes_per_match",
    "progressive_completion_rate",
    "chance_creation_passes_per_match",
    "chance_creation_completion_rate",
    "risky_forced_passes_per_match",
    "risky_forced_completion_rate",
    "tackles_attempted_per_match",
    "tackles_success_rate",
    "marks_placed_per_match",
    "average_marks_active",
    "dribbles_per_match",
    "crosses_per_match",
    "clears_per_match",
    "turnovers_per_match",
    "offside_violations_per_match",
    "rounds_with_no_shot_per_match",
    "average_movement_used",
    "average_movement_budget_used",
]


def run_case(case: dict[str, int | str | bool], matches: int, output_dir: Path) -> dict:
    cfg = HexConfig(
        mark_mode=str(case["mark_mode"]),
        mark_duration=int(case["mark_duration"]),
        player_mark_movement_tax=bool(case["player_mark_movement_tax"]),
    )
    seed = int(case["seed"])
    rng = random.Random(seed)
    results = [HexMatch(cfg, rng).run() for _ in range(matches)]
    summary = aggregate(results, cfg, seed)
    summary["test_name"] = case["test_name"]
    write_csv(output_dir / f"{case['test_name']}.csv", summary)
    return summary


def write_summary(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                key: f"{row[key]:.4f}" if isinstance(row.get(key), float) else row.get(key, "")
                for key in COLUMNS
            })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run real-hex Futbol '99 MARK comparison simulations.")
    parser.add_argument("--matches", type=int, default=1000)
    parser.add_argument("--output-dir", type=Path, default=Path("sim/results/real_hex_mark_matrix"))
    parser.add_argument("--summary", type=Path, default=Path("sim/results/real_hex_mark_matrix_summary.csv"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows = []
    for case in CASES:
        print(f"\n=== {case['test_name']} ===")
        summary = run_case(case, args.matches, args.output_dir)
        print_summary(summary)
        rows.append(summary)
    write_summary(args.summary, rows)
    print(f"\nReal-hex matrix summary written to {args.summary}")


if __name__ == "__main__":
    main()
