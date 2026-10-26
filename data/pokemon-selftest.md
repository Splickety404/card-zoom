## Picture index: pokemon

20583 artworks, 1.5 MB. Chosen colour weight 2, max distance 47.1.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 797 | 92.0% | 97.6% | 99.2% | 99.5% | 99.6% | 99.5% | 38.0 / 50.5 | 11.1 |
| 48 | 797 | 94.6% | 98.4% | 99.5% | 99.7% | 99.7% | 99.7% | 36.1 / 48.3 | 14.5 |
| 72 | 797 | 95.1% | 98.5% | 99.6% | 100.0% | 100.0% | 100.0% | 34.5 / 46.2 | 16.3 |
| 120 | 797 | 98.9% | 99.9% | 100.0% | 100.0% | 100.0% | 100.0% | 30.6 / 41.9 | 19.8 |

Non-card crops, best distance (chosen w): p05 47.3, p50 68.5, p90 77.5

### Learned embedding

Top-1 by card height: 32px 92.0%, 48px 99.9%, 72px 100.0%, 120px 100.0%.
Correct matches' similarity p05 0.729, p50 0.849; lead p10 0.102. Non-cards' best similarity p50 0.499, p99 0.673.
Accepted (similarity ≥ 0.673, lead ≥ 0.02) and correct: 32px 61.7%, 48px 97.0%, 72px 99.7%, 120px 99.9%

Share of cards identified correctly *and* under the cut-off: 32px 87.7%, 48px 93.5%, 72px 96.6%, 120px 98.1%
