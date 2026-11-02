## Picture index: pokemon

20583 artworks, 1.5 MB. Chosen colour weight 1.5, max distance 39.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 799 | 91.9% | 97.6% | 99.2% | 99.6% | 99.5% | 99.5% | 32.0 / 42.1 | 10.0 |
| 48 | 799 | 93.9% | 99.0% | 99.9% | 99.9% | 99.9% | 99.7% | 30.2 / 39.9 | 12.5 |
| 72 | 799 | 97.2% | 99.5% | 99.9% | 99.9% | 99.9% | 99.7% | 28.7 / 37.6 | 14.0 |
| 120 | 799 | 99.2% | 99.9% | 99.9% | 99.9% | 99.9% | 99.9% | 25.4 / 34.5 | 16.8 |

Non-card crops, best distance (chosen w): p05 42.2, p50 56.7, p90 63.6

### Learned embedding

Top-1 by card height: 32px 90.9%, 48px 99.5%, 72px 99.7%, 120px 100.0%.
Correct matches' similarity p05 0.728, p50 0.852; lead p10 0.109. Non-cards' best similarity p50 0.495, p99 0.639.
Accepted (similarity ≥ 0.639, lead ≥ 0.02) and correct: 32px 77.6%, 48px 98.2%, 72px 99.7%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 89.0%, 48px 93.2%, 72px 96.7%, 120px 98.4%
