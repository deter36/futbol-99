#!/usr/bin/env python3
"""Run a documented Futbol '99 simulation matrix."""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from simulate import Config, Match, aggregate, print_summary, write_csv


MATRIX_CASES = [
    {
        "test_name": "v2_move5_shot3_goalie",
        "movement_per_activation": 5,
        "shot_target_number": 3,
        "seed": 2301,
    },
    {
        "test_name": "v2_move5_shot4_goalie",
        "movement_per_activation": 5,
        "shot_target_number": 4,
        "seed": 2401,
    },
    {
        "test_name": "v2_move4_shot3_goalie",
        "movement_per_activation": 4,
        "shot_target_number": 3,
        "seed": 2302,
    },
    {
        "test_name": "v2_move4_shot4_goalie",
        "movement_per_activation": 4,
        "shot_target_number": 4,
        "seed": 2402,
    },
    {
        "test_name": "v2_move4_shot5_goalie",
        "movement_per_activation": 4,
        "shot_target_number": 5,
        "seed": 2502,
    },
]


SUMMARY_COLUMNS = [
    "test_name",
    "matches",
    "seed",
    "movement_per_activation",
    "ball_carrier_movement",
    "shot_target_number",
    "shot_target_mode",
    "center_shot_target_number",
    "wide_shot_target_number",
    "goalie_enabled",
    "goalie_shot_penalty",
    "marked_hex_exit_cost",
    "mark_duration",
    "bot_style",
    "offside_enabled",
    "shots_per_match",
    "goals_per_match",
    "passes_attempted_per_match",
    "pass_completion_rate",
    "tackles_attempted_per_match",
    "tackles_success_rate",
    "marks_placed_per_match",
    "average_marks_active",
    "offside_violations_per_match",
    "rounds_with_no_shot_per_match",
    "average_movement_used",
    "average_movement_budget_used",
    "average_ball_depth",
    "turnovers_per_match",
]


def run_case(case: dict[str, int | str], matches: int, output_dir: Path) -> dict[str, float]:
    cfg = Config(
        movement_per_activation=int(case["movement_per_activation"]),
        ball_carrier_movement=int(case.get("ball_carrier_movement", 4)),
        shot_target_number=int(case["shot_target_number"]),
        shot_target_mode=str(case.get("shot_target_mode", "flat")),
        center_shot_target_number=int(case.get("center_shot_target_number", 4)),
        wide_shot_target_number=int(case.get("wide_shot_target_number", 5)),
        goalie_enabled=bool(case.get("goalie_enabled", True)),
        goalie_shot_penalty=int(case.get("goalie_shot_penalty", 1)),
        marked_hex_exit_cost=int(case.get("marked_hex_exit_cost", 2)),
        mark_duration=int(case.get("mark_duration", 2)),
        bot_style=str(case.get("bot_style", "balanced")),
        offside_enabled=bool(case.get("offside_enabled", True)),
    )
    seed = int(case["seed"])
    rng = random.Random(seed)
    results = [Match(cfg, rng).run() for _ in range(matches)]
    summary = aggregate(results, cfg, seed)
    summary["test_name"] = str(case["test_name"])
    write_csv(output_dir / f"{case['test_name']}.csv", summary)
    return summary


def write_matrix(path: Path, rows: list[dict[str, float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SUMMARY_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                key: f"{row[key]:.4f}" if isinstance(row.get(key), float) else row.get(key, "")
                for key in SUMMARY_COLUMNS
            })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the documented Futbol '99 v2 simulation matrix.")
    parser.add_argument("--matches", type=int, default=10_000)
    parser.add_argument("--output-dir", type=Path, default=Path("sim/results/v2_matrix"))
    parser.add_argument("--summary", type=Path, default=Path("sim/results/v2_matrix_summary.csv"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summaries = []
    for case in MATRIX_CASES:
        print(f"\n=== {case['test_name']} ===")
        summary = run_case(case, args.matches, args.output_dir)
        print_summary(summary)
        summaries.append(summary)
    write_matrix(args.summary, summaries)
    print(f"\nMatrix summary written to {args.summary}")


if __name__ == "__main__":
    main()
