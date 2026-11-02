## Picture index: fab

16657 artworks, 1.2 MB. Chosen colour weight 2, max distance 48.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 799 | 60.2% | 66.3% | 67.7% | 67.3% | 67.7% | 67.1% | 40.0 / 52.2 | 0.1 |
| 48 | 799 | 62.6% | 65.6% | 66.7% | 67.1% | 66.8% | 67.2% | 37.1 / 48.5 | 0.1 |
| 72 | 799 | 65.3% | 67.7% | 68.0% | 68.2% | 68.3% | 68.2% | 36.3 / 47.6 | 0.1 |
| 120 | 799 | 67.0% | 67.1% | 67.1% | 67.5% | 67.5% | 67.5% | 31.4 / 41.1 | 0.1 |

Non-card crops, best distance (chosen w): p05 56.9, p50 65.8, p90 75.9

### Learned embedding

Top-1 by card height: 32px 60.8%, 48px 65.2%, 72px 65.3%, 120px 66.8%.
Correct matches' similarity p05 0.701, p50 0.838; lead p10 0.002. Non-cards' best similarity p50 0.447, p99 0.641.
Accepted (similarity ≥ 0.641, lead ≥ 0.02) and correct: 32px 41.1%, 48px 64.0%, 72px 65.3%, 120px 66.8%

Share of cards identified correctly *and* under the cut-off: 32px 57.6%, 48px 63.0%, 72px 65.5%, 120px 67.0%
