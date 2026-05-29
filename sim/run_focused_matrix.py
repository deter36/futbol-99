#!/usr/bin/env python3
"""Run the focused shot/mark-duration baseline tests."""

from __future__ import annotations

import argparse
from pathlib import Path

import run_matrix


FOCUSED_CASES = [
    {
        "test_name": "baseline_shot5_mark2",
        "movement_per_activation": 4,
        "ball_carrier_movement": 3,
        "shot_target_number": 5,
        "shot_target_mode": "flat",
        "goalie_enabled": True,
        "goalie_shot_penalty": 1,
        "marked_hex_exit_cost": 2,
        "mark_duration": 2,
        "bot_style": "balanced",
        "offside_enabled": True,
        "seed": 3502,
    },
    {
        "test_name": "baseline_shot5_mark1",
        "movement_per_activation": 4,
        "ball_carrier_movement": 3,
        "shot_target_number": 5,
        "shot_target_mode": "flat",
        "goalie_enabled": True,
        "goalie_shot_penalty": 1,
        "marked_hex_exit_cost": 2,
        "mark_duration": 1,
        "bot_style": "balanced",
        "offside_enabled": True,
        "seed": 3501,
    },
    {
        "test_name": "center4_wide5_mark2",
        "movement_per_activation": 4,
        "ball_carrier_movement": 3,
        "shot_target_number": 5,
        "shot_target_mode": "lane",
        "center_shot_target_number": 4,
        "wide_shot_target_number": 5,
        "goalie_enabled": True,
        "goalie_shot_penalty": 1,
        "marked_hex_exit_cost": 2,
        "mark_duration": 2,
        "bot_style": "balanced",
        "offside_enabled": True,
        "seed": 4502,
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run focused Futbol '99 baseline simulations.")
    parser.add_argument("--matches", type=int, default=10_000)
    parser.add_argument("--output-dir", type=Path, default=Path("sim/results/focused_baseline"))
    parser.add_argument("--summary", type=Path, default=Path("sim/results/focused_baseline_summary.csv"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summaries = []
    for case in FOCUSED_CASES:
        print(f"\n=== {case['test_name']} ===")
        summary = run_matrix.run_case(case, args.matches, args.output_dir)
        run_matrix.print_summary(summary)
        summaries.append(summary)
    run_matrix.write_matrix(args.summary, summaries)
    print(f"\nFocused matrix summary written to {args.summary}")


if __name__ == "__main__":
    main()
