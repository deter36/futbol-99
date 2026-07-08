#!/usr/bin/env python3
"""Compare hex MARK against the first player-MARK approximations."""

from __future__ import annotations

import argparse
from pathlib import Path

import run_matrix


BASELINE = {
    "movement_per_activation": 4,
    "ball_carrier_movement": 2,
    "shot_target_number": 4,
    "shot_target_mode": "flat",
    "goalie_enabled": False,
    "goalie_shot_penalty": 1,
    "marked_hex_exit_cost": 2,
    "mark_duration": 2,
    "bot_style": "balanced",
    "offside_enabled": True,
    "shooter_movement_allowance": 1,
    "flank_service_enabled": False,
}


MARK_MODE_CASES = [
    {
        **BASELINE,
        "test_name": "hex_mark_baseline",
        "mark_mode": "hex",
        "player_mark_movement_tax": True,
        "seed": 7101,
    },
    {
        **BASELINE,
        "test_name": "player_mark_tax",
        "mark_mode": "player",
        "player_mark_movement_tax": True,
        "seed": 7102,
    },
    {
        **BASELINE,
        "test_name": "player_mark_no_tax",
        "mark_mode": "player",
        "player_mark_movement_tax": False,
        "seed": 7103,
    },
    {
        **BASELINE,
        "test_name": "player_mark_duration1",
        "mark_mode": "player",
        "player_mark_movement_tax": True,
        "mark_duration": 1,
        "seed": 7104,
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Futbol '99 MARK-mode comparison simulations.")
    parser.add_argument("--matches", type=int, default=10_000)
    parser.add_argument("--output-dir", type=Path, default=Path("sim/results/mark_mode_matrix"))
    parser.add_argument("--summary", type=Path, default=Path("sim/results/mark_mode_matrix_summary.csv"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summaries = []
    for case in MARK_MODE_CASES:
        print(f"\n=== {case['test_name']} ===")
        summary = run_matrix.run_case(case, args.matches, args.output_dir)
        run_matrix.print_summary(summary)
        summaries.append(summary)
    run_matrix.write_matrix(args.summary, summaries)
    print(f"\nMARK-mode matrix summary written to {args.summary}")


if __name__ == "__main__":
    main()
