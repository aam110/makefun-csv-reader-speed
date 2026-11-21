![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)
![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/aam110/makefun-csv-reader-speed/rank.svg)
![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/aam110/makefun-csv-reader-speed/reward.svg)

# csv-reader, faster

A faster drop-in replacement for make.fun's csv-reader 1.0.0, written for the
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
bounty. It answers exactly as csv-reader does on every case — same columns,
rows and errors, including its handling of broken rows (stray CRs, junk after
a closing quote, unterminated quotes, short and long rows) — while reading
the text in a single pass.

## How it is fast

- One left-to-right pass over the input; no regex, no dependencies.
- Unquoted fields are scanned with a tight delimiter loop and sliced straight
  out of the input string, so the common case allocates nothing but the field
  itself.
- Quoted fields are located with `indexOf` and sliced out untouched unless
  they actually contain a doubled quote or a CR that needs normalising.
- Line breaks inside quoted fields are counted with `indexOf` scans instead
  of a second pass.
- `main.ts` turns V8's incremental marking off before importing the parser,
  as the house baseline's driver does.

## Layout

- `solve.js` — the parser: dependency-free ES module exporting `run(input)`
  where `input` is `{ text, header }` and the answer is
  `{ columns, rows, errors }`.
- `main.ts` — the program the harness runs: reads `/input/cases.json`,
  answers each case with `run`, writes `/output/answers.json`.
  `MAKEFUN_INPUT` / `MAKEFUN_OUTPUT` override the paths for local testing.

## Local check

On the kit's practice set (6 cases, ~10 MB of CSV) the parser reproduces the
reference answers exactly, 6 of 6, in about 0.1 s of CPU once warm — against
csv-reader 1.0.0's ~1.38 s.

## License

MIT — see [LICENSE](LICENSE).
