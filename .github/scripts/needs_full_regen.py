#!/usr/bin/env python3
"""Print "true" if the streamer CSVs and the English pages disagree on who is
listed, i.e. a secinfo full regen is needed to rebuild the pages from the
CSVs (a streamer was added, removed or renamed by hand). Otherwise "false".

This compares state rather than diffing the triggering push, so a CSV change
can't be missed when GitHub coalesces queued runs. StreamStatus moves rows and
CSV lines together, so its pushes don't need a full regen.
"""
import sys


def csv_names(path):
    with open(path, encoding="utf-8") as f:
        return {line.split(",", 1)[0].strip().lower() for line in f if line.strip()}


def page_names(path, separator):
    names, in_table = set(), False
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith(separator):
                in_table = True
                continue
            if in_table and line.startswith("### "):
                break
            if in_table:
                parts = line.split("`")
                if len(parts) >= 3 and parts[1]:
                    names.add(parts[1].lower())
    return names


def main():
    active = csv_names("streamers.csv") == page_names("index.md", "---: | --- | :--- | :---")
    inactive = csv_names("inactive_streamers.csv") == page_names("inactive.md", "--: | ---")
    print("false" if active and inactive else "true")


if __name__ == "__main__":
    sys.exit(main())
