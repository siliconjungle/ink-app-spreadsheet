#!/usr/bin/env python3
"""Labelled broken CSV/TSV files for training the recovery hole in csv.ink.

Each case is a file that a strict RFC 4180 parser rejects, labelled with the
grid its author meant. The damage follows common real mistakes: unescaped
quotes inside a quoted field, a quote inside an unquoted field (inch marks,
nicknames), and a final quoted field missing its closing quote. Files are
deterministic for a seed; training and held-out sets use different seeds.

    python3 recovery-data.py --seed 1 --count 48 -o recovery-train.json
    python3 recovery-data.py --seed 2 --count 48 -o recovery-heldout.json
"""
import argparse
import json
import random

WORDS = ["alpha", "Zoë", "north", "budget", "tea", "Q3", "café", "draft", "ok", "new york",
         "12", "3.5", "-4", "2026-11-04", "yes", "no", "Ana", "Kim", "plan", "日本"]


def field(r):
    kind = r.random()
    if kind < 0.15:
        return r.choice(WORDS) + ", " + r.choice(WORDS)        # needs quoting
    if kind < 0.2:
        return r.choice(WORDS) + "\n" + r.choice(WORDS)        # embedded newline
    if kind < 0.25:
        return '"' + r.choice(WORDS) + '"'                       # escaped quotes
    return " ".join(r.choice(WORDS) for _ in range(r.randint(1, 2)))


def encode(cell, delimiter):
    if any(ch in cell for ch in ('"', delimiter, "\n", "\r")):
        return '"' + cell.replace('"', '""') + '"'
    return cell


def table(r):
    cols, rows = r.randint(2, 4), r.randint(2, 4)
    return [[field(r) for _ in range(cols)] for _ in range(rows)]


def damage(r, grid, delimiter):
    """Return (text, intended grid) with exactly one realistic mistake."""
    grid = [row[:] for row in grid]
    newline = r.choice(["\n", "\r\n"])
    row = r.randrange(len(grid))
    col = r.randrange(len(grid[0]))
    mistake = r.choice(["inner", "inch", "unclosed"])
    lines = []
    for i, cells in enumerate(grid):
        out = []
        for j, cell in enumerate(cells):
            if (i, j) != (row, col):
                out.append(encode(cell, delimiter))
                continue
            if mistake == "inner":
                # The writer quoted the field but did not double the inner quotes.
                cell = r.choice(WORDS) + ' "' + r.choice(["hi", "ok", "Bob"]) + '" ' + r.choice(WORDS)
                grid[i][j] = cell
                out.append('"' + cell + '"')
            elif mistake == "inch":
                # An unquoted field containing a quote character.
                cell = str(r.randint(2, 30)) + '" ' + r.choice(["screen", "pipe", "panel"])
                grid[i][j] = cell
                out.append(cell)
            else:
                out.append(encode(cell, delimiter))
        lines.append(delimiter.join(out))
    text = newline.join(lines)
    if mistake == "unclosed":
        # The last field is quoted but the file ends before its closing quote.
        last = r.choice(WORDS) + " " + r.choice(WORDS)
        grid[-1][-1] = last
        cells = [encode(c, delimiter) for c in grid[-1][:-1]] + ['"' + last]
        lines[-1] = delimiter.join(cells)
        text = newline.join(lines)
    elif r.random() < 0.5:
        text += newline
    return text, grid


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--seed", type=int, required=True)
    a.add_argument("--count", type=int, default=48)
    a.add_argument("-o", required=True)
    args = a.parse_args()
    r = random.Random(args.seed)
    cases = []
    while len(cases) < args.count:
        delimiter = r.choice([",", ",", "\t"])
        text, grid = damage(r, table(r), delimiter)
        cases.append({"text": text, "delimiter": ord(delimiter), "cells": grid})
    with open(args.o, "w", encoding="utf-8") as f:
        json.dump([cases], f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
