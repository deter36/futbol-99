#!/usr/bin/env python3
"""Run the focused free-pass rule comparison tests."""

from __future__ import annotations

import argparse
from pathlib import Path

import run_matrix


FREE_PASS_CASES = [
    {
        "test_name": "free_pass_baseline",
        "movement_per_activation": 4,
        "ball_carrier_movement": 2,
        "shot_target_number": 5,
        "shot_target_mode": "flat",
        "goalie_enabled": False,
        "marked_hex_exit_cost": 2,
        "mark_duration": 2,
        "bot_style": "balanced",
        "offside_enabled": True,
        "shooter_movement_allowance": 0,
        "flank_service_enabled": False,
        "seed": 62001,
    },
    {
        "test_name": "free_pass_shooter_move1",
        "movement_per_activation": 4,
        "ball_carrier_movement": 2,
        "shot_target_number": 5,
        "shot_target_mode": "flat",
        "goalie_enabled": False,
        "marked_hex_exit_cost": 2,
        "mark_duration": 2,
        "bot_style": "balanced",
        "offside_enabled": True,
        "shooter_movement_allowance": 1,
        "flank_service_enabled": False,
        "seed": 62002,
    },
    {
        "test_name": "free_pass_flank_service",
        "movement_per_activation": 4,
        "ball_carrier_movement": 2,
        "shot_target_number": 5,
        "shot_target_mode": "flat",
        "goalie_enabled": False,
        "marked_hex_exit_cost": 2,
        "mark_duration": 2,
        "bot_style": "balanced",
        "offside_enabled": True,
        "shooter_movement_allowance": 0,
        "flank_service_enabled": True,
        "seed": 62003,
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run focused Futbol '99 free-pass simulations.")
    parser.add_argument("--matches", type=int, default=5_000)
    parser.add_argument("--output-dir", type=Path, default=Path("sim/results/free_pass_matrix"))
    parser.add_argument("--summary", type=Path, default=Path("sim/results/free_pass_matrix_summary.csv"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summaries = []
    for case in FREE_PASS_CASES:
        print(f"\n=== {case['test_name']} ===")
        summary = run_matrix.run_case(case, args.matches, args.output_dir)
        run_matrix.print_summary(summary)
        summaries.append(summary)
    run_matrix.write_matrix(args.summary, summaries)
    print(f"\nFree-pass matrix summary written to {args.summary}")


if __name__ == "__main__":
    main()
