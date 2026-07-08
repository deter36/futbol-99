#!/usr/bin/env python3
"""Smoke tests for the real Futbol '99 hex geometry."""

from __future__ import annotations

import hex_geometry as hg


def assert_equal(actual, expected, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def main() -> None:
    assert_equal(len(hg.all_cells()), 213, "cell count")
    assert_equal(hg.column_height(0), 13, "even column height")
    assert_equal(hg.column_height(1), 12, "odd column height")

    for cell in hg.all_cells():
        for neighbor in hg.neighbors(cell):
            if cell not in hg.neighbors(neighbor):
                raise AssertionError(f"neighbor symmetry failed: {cell} -> {neighbor}")
            assert_equal(hg.distance(cell, neighbor), 1, f"neighbor distance {cell}->{neighbor}")

    assert_equal(hg.distance((8, 6), (8, 6)), 0, "same-cell distance")
    assert_equal(hg.distance((8, 6), (9, 6)), 1, "adjacent distance")
    assert_equal(hg.distance((0, 6), (16, 6)), 16, "goal-to-goal center distance")

    assert_equal(hg.zones((0, 0), "player").third, "defensive", "blue defensive third")
    assert_equal(hg.zones((16, 0), "player").third, "attacking", "blue attacking third")
    assert_equal(hg.zones((0, 0), "ai").third, "attacking", "red attacking third")
    assert_equal(hg.zones((1, 3), "player").lanes, ("left", "center"), "left-center split")
    assert_equal(hg.zones((1, 8), "player").lanes, ("center", "right"), "center-right split")
    assert_equal(hg.zones((1, 3), "ai").lanes, ("right", "center"), "red flipped split")

    center_line = hg.hex_line((0, 6), (16, 6))
    if not center_line:
        raise AssertionError("center line should contain intermediate cells")
    if (0, 6) in center_line or (16, 6) in center_line:
        raise AssertionError("line should exclude endpoints by default")

    # Exact edge-threading example: this should include more than the simple
    # distance-minus-one count when the line rides along hex boundaries.
    edge_line = hg.hex_line((0, 5), (16, 7))
    if len(edge_line) <= hg.distance((0, 5), (16, 7)) - 1:
        raise AssertionError("edge line did not include extra boundary cells")

    reachable = hg.reachable((8, 6), 2, occupied={(8, 5)})
    if (8, 5) in reachable:
        raise AssertionError("reachable should respect occupied cells")
    if (8, 4) in reachable:
        raise AssertionError("occupied cell should block shortest path through itself")

    print("hex geometry tests passed")


if __name__ == "__main__":
    main()
