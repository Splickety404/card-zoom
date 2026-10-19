## Picture index: pokemon

20583 artworks, 1.5 MB. Chosen colour weight 1.5, max distance 39.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 799 | 91.6% | 97.6% | 99.4% | 99.7% | 99.7% | 99.7% | 32.3 / 42.8 | 9.8 |
| 48 | 799 | 94.7% | 98.6% | 99.9% | 99.9% | 99.9% | 99.9% | 30.7 / 39.8 | 12.6 |
| 72 | 799 | 96.0% | 99.6% | 99.7% | 99.9% | 99.9% | 99.7% | 29.1 / 38.4 | 14.1 |
| 120 | 799 | 99.1% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 25.9 / 35.5 | 17.1 |

Non-card crops, best distance (chosen w): p05 41.9, p50 56.0, p90 63.6

### Learned embedding

Top-1 by card height: 32px 90.9%, 48px 99.2%, 72px 100.0%, 120px 100.0%.
Correct matches' similarity p05 0.721, p50 0.851; lead p10 0.111. Non-cards' best similarity p50 0.5, p99 0.696.
Accepted (similarity ≥ 0.696, lead ≥ 0.02) and correct: 32px 55.7%, 48px 94.1%, 72px 99.5%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 88.5%, 48px 94.4%, 72px 95.5%, 120px 98.2%
